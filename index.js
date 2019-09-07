const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cookiesMiddleware = require('universal-cookie-express');
const cors = require("cors");

const { Pool } = require('pg');
const dbParams = require('./lib/db.js');
const db = new Pool(dbParams);
db.connect();

const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

// app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
app.use(cookiesMiddleware());
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

app.get('/api/getTables/:restaurantId', (req, res) => {
  const restaurantId = req.params.restaurantId;
  console.log(restaurantId);
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
      req.universalCookies.set('user', restaurantId);
      res.send(`/admin/${restaurantId}`);
    })
    .catch((error) => {
      res.send(`/admin`);
    });
});

app.post('/logout', (req, res) => {
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
      const customers = response.rows[0].current_number_customers;
      console.log(customers)
      if (customers == 0){
        const queryConfig = {
          text: "INSERT into orders (table_id, completed) VALUES ($1, FALSE) RETURNING id",
          values: [req.params.table_id]
        }
        db.query(queryConfig)
          .then(
            (response) => {
              const queryConfig = {
                text: `UPDATE tables SET current_number_customers = 1 WHERE id = $1`,
                values: [req.params.table_id]
              }
              db.query(queryConfig)
              res.send(response.rows[0])
          })
      } else {
        const queryConfig = {
          text: "SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE",
          values: [req.params.table_id]
        }
        db.query(queryConfig)
          .then((response)=>{
            const queryConfig = {
              text: `UPDATE tables SET current_number_customers = ${customers + 1} WHERE id = $1`,
              values: [req.params.table_id]
            }
            db.query(queryConfig)
            res.send(response.rows[0])
          })
      }
      // req.session.user = restaurantId;
      // res.send(`/restaurant/${restaurantId}`);
    })
});

app.post('/:table_id/order', (req, res) => {
  const queryConfig = {
    text: "SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE",
    values: [req.params.table_id]
  }
  console.log(`table id: ${req.params.table_id}`);
  db.query(queryConfig)
    .then((response)=>{
      console.log(`order id: ${response.rows[0].id}`);
      console.log(`body: ${req.body.order}`);
      for (item of req.body.order) {
        const queryConfig = {
          text: "INSERT into order_details (item_id, order_id, quantity) VALUES ($1, $2, $3)",
          values: [item.id, response.rows[0].id, item.quantity]
        }
        db.query(queryConfig)
          .then(()=>{
            console.log(`item id: ${item.id}, item quantity: ${item.quantity}`);
            if (req.body.order[req.body.order.length - 1].id == item.id){
              res.send("success");
            }
          })
      }
    })
})

// Handles any requests that don't match the ones above
app.get('*', (req, res) => {
  // res.sendFile(path.join(__dirname+'/client/build/index.html'));
  res.send("nah");
});

const port = process.env.PORT || 5000;
app.listen(port);

console.log('App is listening on port ' + port);