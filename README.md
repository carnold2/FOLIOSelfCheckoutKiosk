# FOLIOSelfCheckoutKiosk
Self Checkout Kiosk for FOLIO Integrated Library Systems

This code enables Raspberry PI to be used as a very inexpensive self-checkout kiosk for libraries running the FOLIO ILS. 

Code is written for Raspberry PI 4, and uses Node.js to make API calls to the FOLIO system to checkout materials. When FOLIO pops an error (the barcode isn't found / the item is unloanable), the user is asked to see library staff for help. 
