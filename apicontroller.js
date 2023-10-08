const https=require('https');
const HEADERS= {
    'Content-Type': 'application/json',
  };

class ApiController {
    async restJSONPost(foliohost, servicepoint, tenant, token, userbarcode, itembarcode){
      return new Promise((resolve,_) => {
        const path="/circulation/check-out-by-barcode";
        const method='POST';
	const body = JSON.stringify({
    	    userBarcode: userbarcode,
    	    itemBarcode: itembarcode,
    	    servicePointId: servicepoint,
  	});

        const options = {
            hostname: foliohost,
            path: path,
            method: method,
            headers: {
		'X-Okapi-Tenant': tenant,
		'X-Okapi-Token': token,
		'Content-Type': 'application/json',
    		'Content-Length': Buffer.byteLength(body),
	    }
         };

        let data='';
        const request = https.request(options, (response) => {
          // Set the encoding, so we don't get log to the console a bunch of gibberish binary data
          response.setEncoding('utf8');
        
          // As data starts streaming in, add each chunk to "data"
          response.on('data', (chunk) => {
            data += chunk;
          });
        
          // The whole response has been received. Print out the result.
          response.on('end', () => {
            console.log(data);
            return resolve(data);
          });
        });
        
        // Log errors if any occur
        request.on('error', (error) => {
          console.error(error);
        });

	request.write(body);
        
        // End the request
        request.end();
      });
    };
    async postBarcode(foliohost, servicepoint, tenant, token, userbarcode, itembarcode) {
        const data = await this.restJSONPost(foliohost, servicepoint, tenant, token, userbarcode, itembarcode);
        return data;
    }
};

module.exports = ApiController
