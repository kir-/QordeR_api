const express = require('express');
const path = require('path');
var bodyParser = require('body-parser')

const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));
app.use(bodyParser.json());

let order = ["Fries", "Burger"]

// An api endpoint that returns a short list of items
app.get('/api/getMenu', (req,res) => {
    res.json(order);
    console.log('Sent list of items');
});

app.post('/api/getMenu', (req,res) => {
  order.push(req.body.order)
  console.log('Got an order!\n')
  console.log(req.body)
  res.send('success');
});

// Handles any requests that don't match the ones above
app.get('*', (req,res) =>{
    // res.sendFile(path.join(__dirname+'/client/build/index.html'));
    res.send("nah")
});

const port = process.env.PORT || 5000;
app.listen(port);

console.log('App is listening on port ' + port);