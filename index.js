const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const morgan = require('morgan');
const cors = require("cors");

const { Pool } = require('pg');
const dbParams = require('./lib/db.js');
const db = new Pool(dbParams);
db.connect();

const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
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

app.get(`/api/getTables/:id`, (req, res) => {
  const restaurantId = req.params.id;

});

app.post('/login', (req, res) => {
  const user = req.body.email;
  const password = req.body.password;
  const queryConfig = {
    text: `SELECT id, password FROM restaurants WHERE username = $1 AND password = $2`,
    values: [user, password]
  };
  db.query(queryConfig)
    .then((response) => {
      const restaurantId = response.rows[0].id;
      req.session.user = restaurantId;
      res.send(`/restaurant/${restaurantId}`);
    })
    .catch((error) => {
      res.send(`/admin`);
    });
});

app.post('/logout', (req, res) => {
  req.session = null;
  res.send(`/admin`);
});

app.get('/restaurant/:id', (req, res) => {
  const queryConfig = {
    text: "SELECT * FROM tables WHERE restaurant_id = $1",
    values: [req.params.id]
  };
});

app.get('/:table_id', (req, res) => {
  const queryConfig = {
    text: "SELECT current_number_customers FROM tables WHERE id = $1",
    values: [req.params.table_id]
  };
  db.query(queryConfig)
    .then((response) => {
      // const restaurantId = response.rows[0].id;
      res.send(response.rows);
      // req.session.user = restaurantId;
      // res.send(`/restaurant/${restaurantId}`);
    })
});

// Handles any requests that don't match the ones above
app.get('*', (req, res) => {
  // res.sendFile(path.join(__dirname+'/client/build/index.html'));
  res.send("nah");
});

const port = process.env.PORT || 5000;
app.listen(port);

console.log('App is listening on port ' + port);