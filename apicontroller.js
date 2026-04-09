const https = require('https');
const querystring = require('querystring');

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

class ApiController {
    constructor() {
        this._token = null;
    }

    _request(options, body) {
        return new Promise((resolve, reject) => {
            let data = '';
            const req = https.request(options, (res) => {
                res.setEncoding('utf8');
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
            });
            req.on('error', reject);
            if (body) req.write(body);
            req.end();
        });
    }

    _collectCookies(existing, setCookieHeaders) {
        const cookies = Object.assign({}, existing);
        if (!setCookieHeaders) return cookies;
        const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
        for (const header of headers) {
            const match = header.match(/^([^=]+)=("?)([^;]*)\2/);
            if (match) {
                const name = match[1].trim();
                const value = match[3].trim();
                if (header.includes('Max-Age=0')) {
                    delete cookies[name];
                } else {
                    cookies[name] = value;
                }
            }
        }
        return cookies;
    }

    _formatCookies(cookies) {
        return Object.entries(cookies).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    async login(foliohost, tenant, keycloakhost, clientId, redirectUri, username, password) {
        // Step 1: GET the Keycloak login page
        const authPath = `/realms/${tenant}/protocol/openid-connect/auth?` + querystring.stringify({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid',
        });

        let res = await this._request({ hostname: keycloakhost, path: authPath, method: 'GET', headers: BROWSER_HEADERS });
        let cookies = this._collectCookies({}, res.headers['set-cookie']);
        let html = res.body;

        while (res.statusCode === 302 && res.headers.location) {
            const loc = new URL(res.headers.location);
            res = await this._request({
                hostname: loc.hostname,
                path: loc.pathname + loc.search,
                method: 'GET',
                headers: { ...BROWSER_HEADERS, 'Cookie': this._formatCookies(cookies) },
            });
            cookies = this._collectCookies(cookies, res.headers['set-cookie']);
            html = res.body;
        }

        // Parse form action URL
        const actionMatch = html.match(/action="(https:\/\/[^"]+login-actions\/authenticate[^"]+)"/);
        if (!actionMatch) throw new Error('Could not find Keycloak login form');
        const actionUrl = actionMatch[1].replace(/&amp;/g, '&');
        const actionParsed = new URL(actionUrl);

        // Parse hidden fields
        const hiddenFields = {};
        const re = /<input[^>]+type=["']?hidden["']?[^>]*>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            const nameMatch = m[0].match(/name=["']([^"']+)["']/i);
            const valueMatch = m[0].match(/value=["']([^"']*)["']/i);
            if (nameMatch) hiddenFields[nameMatch[1]] = valueMatch ? valueMatch[1] : '';
        }

        // Step 2: POST credentials
        const credBody = querystring.stringify(Object.assign({}, hiddenFields, { username, password }));
        const credRes = await this._request({
            hostname: actionParsed.hostname,
            path: actionParsed.pathname + actionParsed.search,
            method: 'POST',
            headers: {
                ...BROWSER_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(credBody),
                'Cookie': this._formatCookies(cookies),
                'Origin': `https://${keycloakhost}`,
                'Referer': `https://${keycloakhost}${authPath}`,
            },
        }, credBody);

        if (credRes.statusCode !== 302) throw new Error('Login failed: invalid credentials or Keycloak rejected the request');

        const codeMatch = credRes.headers.location?.match(/[?&]code=([^&]+)/);
        if (!codeMatch) throw new Error(`No authorization code in redirect: ${credRes.headers.location}`);
        const code = decodeURIComponent(codeMatch[1]);

        // Step 3: Exchange code via FOLIO API (which holds the Keycloak client secret)
        const tokenPath = '/authn/token?' + querystring.stringify({ code, 'redirect-uri': redirectUri });
        const tokenRes = await this._request({
            hostname: foliohost,
            path: tokenPath,
            method: 'GET',
            headers: { 'X-Okapi-Tenant': tenant },
        });

        if (tokenRes.statusCode !== 201) throw new Error(`FOLIO token exchange failed: ${tokenRes.statusCode} ${tokenRes.body}`);

        const token = tokenRes.headers['x-okapi-token'];
        if (!token) throw new Error('No x-okapi-token in FOLIO response');

        this._token = token;
        console.log('FOLIO login successful');
    }

    async restJSONPost(foliohost, servicepoint, tenant, userbarcode, itembarcode) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                userBarcode: userbarcode,
                itemBarcode: itembarcode,
                servicePointId: servicepoint,
            });

            const options = {
                hostname: foliohost,
                path: '/circulation/check-out-by-barcode',
                method: 'POST',
                headers: {
                    'X-Okapi-Tenant': tenant,
                    'X-Okapi-Token': this._token,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                }
            };

            let data = '';
            const request = https.request(options, (response) => {
                response.setEncoding('utf8');
                response.on('data', (chunk) => { data += chunk; });
                response.on('end', () => {
                    console.log(data);
                    resolve({ statusCode: response.statusCode, data });
                });
            });

            request.on('error', (error) => {
                console.error(error);
                reject(error);
            });

            request.write(body);
            request.end();
        });
    }

    async postBarcode(foliohost, servicepoint, tenant, keycloakhost, clientId, redirectUri, username, password, userbarcode, itembarcode) {
        if (!this._token) {
            await this.login(foliohost, tenant, keycloakhost, clientId, redirectUri, username, password);
        }

        let result = await this.restJSONPost(foliohost, servicepoint, tenant, userbarcode, itembarcode);

        if (result.statusCode === 401) {
            console.log('Token expired, re-logging in...');
            this._token = null;
            await this.login(foliohost, tenant, keycloakhost, clientId, redirectUri, username, password);
            result = await this.restJSONPost(foliohost, servicepoint, tenant, userbarcode, itembarcode);
        }

        return result.data;
    }
}

module.exports = ApiController;
