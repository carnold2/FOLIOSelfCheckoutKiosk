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
const token = process.env.KIOSKTOKEN || '';

let barcodes = [];

app.use(cors());

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname,'scanbarcode.html'));
	barcodes = [];
});

//Configuring body parser middleware
app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());

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
			new ApiController().postBarcode(foliohost, servicepoint, tenant, token, userbarcode, itembarcode)
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
			});
		}
	} else {
		console.log(`Unable to checkout for userbarcode: ${userbarcode} ; itembarcode: ${itembarcode}\n`);
		res.sendFile(path.join(__dirname,'error.html'));
	}
	
});

const port = process.env.KIOSKPORT || 3000;
if(token.length == 0){
	console.log("Env KIOSKTOKEN not set\n");
	process.exit();
}
app.listen(port,hostname, () => {
	console.log(`API server listening on port ${port}`);
});
 
