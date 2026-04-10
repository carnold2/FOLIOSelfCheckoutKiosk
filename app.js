const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const ApiController = require('./apicontroller');
const hostname = '127.0.0.1';
const app = express();

//add all these variables to env variables in the init.d startup script
const servicepoint = process.env.KIOSKSERVICEPOINT || '';
const foliohost = process.env.KIOSKFOLIOHOST || '';
const tenant = process.env.KIOSKTENANT || '';
const username = process.env.KIOSKUSERNAME || '';
const password = process.env.KIOSKPASSWORD || '';

// Keycloak auth values — defaults derived from KIOSKFOLIOHOST and KIOSKTENANT
// e.g. if KIOSKFOLIOHOST=api-mylib.folio.ebsco.com and KIOSKTENANT=fs00001234:
//   keycloakhost → keycloak-mylib.folio.ebsco.com
//   clientId     → fs00001234-application
//   redirectUri  → https://mylib.folio.ebsco.com/oidc-landing?tenant=fs00001234&client_id=fs00001234-application
const keycloakhost = process.env.KIOSKKEYCLOAKHOST || foliohost.replace(/^api-/, 'keycloak-');
const clientId = process.env.KIOSKCLIENTID || `${tenant}-application`;
const folioUiHost = process.env.KIOSKFOLIOUIHOST || foliohost.replace(/^api-/, '');
const redirectUri = process.env.KIOSKREDIRECTURI || `https://${folioUiHost}/oidc-landing?tenant=${tenant}&client_id=${clientId}`;

// Single instance so the authentication token is cached across requests
const apiController = new ApiController();

let barcodes = [];

app.use(cors());

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname,'scanbarcode.html'));
	barcodes = [];
});

//Configuring body parser middleware
app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());

app.get('/api/patron/validate', (req, res) => {
	res.redirect('/');
});

app.post('/api/patron/validate', (req, res) => {
	const body = req.body;
	//validate the parameters
	let userbarcode = body.userbarcode;
	const itembarcode = body.itembarcode;
	if(barcodes.length > 0) {
		userbarcode = barcodes[0];
	}
	if(userbarcode && itembarcode) {
		if(userbarcode.length != 14 || itembarcode.length != 14) {
			console.log(`Unable to checkout for userbarcode: ${userbarcode} ; itembarcode: ${itembarcode}\n`);
			res.sendFile(path.join(__dirname,'error.html'));
		} else {
			apiController.postBarcode(foliohost, servicepoint, tenant, keycloakhost, clientId, redirectUri, username, password, userbarcode, itembarcode)
			.then(data => {
				let jsondata = JSON.parse(data);
				if(jsondata.hasOwnProperty("errors")){
					console.log(`Unable to checkout for userbarcode: ${userbarcode} ; itembarcode: ${itembarcode} error:${jsondata}\n`);
					res.sendFile(path.join(__dirname,'error.html'));
				} else {
					res.sendFile(path.join(__dirname,'continue.html'));
					barcodes.push(userbarcode);
				}
			})
			.catch(err => {
				console.log(err)
				res.sendFile(path.join(__dirname,'error.html'));
			});
		}
	} else {
		console.log(`Unable to checkout for userbarcode: ${userbarcode} ; itembarcode: ${itembarcode}\n`);
		res.sendFile(path.join(__dirname,'error.html'));
	}

});

const port = process.env.KIOSKPORT || 3000;
if(username.length == 0 || password.length == 0){
	console.log("Env KIOSKUSERNAME and KIOSKPASSWORD must be set\n");
	process.exit();
}
app.listen(port, hostname, () => {
	console.log(`API server listening on port ${port}`);
});
