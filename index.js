const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const morgan = require('morgan');

const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieSession({
  name: 'session',
  keys: ['key1', 'key2']
}));
app.use(morgan('dev'));

let order = ["Fries", "Burger"];

// An api endpoint that returns a short list of items
app.get('/api/getMenu', (req, res) => {
  res.json(order);
  console.log('Sent list of items');
});

app.post('/api/getMenu', (req, res) => {
  order.push(req.body.order);
  console.log('Got an order!\n');
  console.log(req.body);
  res.send('success');
});

app.post('/login', (req, res) => {
  const user = req.body.email;
  const password = req.body.password;
  console.log(user);
  console.log(password);
  // if found restaurant, return the :ID from PG
  // set cookie using the ID
  // redirect to restaurant/:ID
});

app.post('/logout', (req, res) => {
  console.log('reached logout');
});

app.get('/restaurant/:id', (req, res) => {
  const queryConfig = {
    text: "SELECT * FROM tables WHERE restaurant_id = $1",
    values: [req.params.id]
  };
});

// Handles any requests that don't match the ones above
app.get('*', (req, res) => {
  // res.sendFile(path.join(__dirname+'/client/build/index.html'));
  res.send("nah");
});

const port = process.env.PORT || 5000;
app.listen(port);

console.log('App is listening on port ' + port);