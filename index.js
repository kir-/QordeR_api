const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cookiesMiddleware = require('universal-cookie-express');

const { Pool } = require('pg');
const dbParams = require('./lib/db.js');
const db = new Pool(dbParams);
db.connect();

const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
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
  const queryConfig = {
    text: `
      SELECT id, completed FROM (
        tables LEFT JOIN (
          SELECT table_id, completed FROM orders WHERE completed = 'f'
        ) AS temp0 ON tables.id = table_id
      ) AS temp1 WHERE restaurant_id = $1;
    `,
    values: [req.params.restaurantId]
  };
  db.query(queryConfig)
    .then((response) => {
      console.log(response.rows);
      res.send(response.rows);
    })
    .catch((error) => {
      res.send(error);
    });
});

app.get('/api/getActiveOrderItems/:tableId', (req, res) => {
  const queryConfig = {
    text: `SELECT id AS order_id FROM orders WHERE table_id = $1 AND completed = FALSE`,
    values: [req.params.tableId]
  };
  db.query(queryConfig)
    .then((response) => {
      const queryConfig = {
        text: `SELECT * FROM order_details WHERE order_id = $1`,
        values: [response.rows[0].order_id]
      };
      db.query(queryConfig)
        .then((response) => {
          const orderDetails = response.rows;
          const itemIds = response.rows.map((entry) => {
            return entry.item_id;
          });
          const queryConfig = {
            text: `SELECT id, name FROM items WHERE id IN (${itemIds.map((itemId, index) => {
              return `$${index + 1}`;
            }).join(', ')})`,
            values: itemIds
          };
          db.query(queryConfig)
            .then((response) => {
              const orderItems = response.rows;
              orderDetails.forEach((orderDetail) => {
                orderDetail["item_name"] = (orderItems.find((orderItem) => {
                  return orderItem.id === orderDetail.item_id;
                }).name);
              });
              res.send(orderDetails);
            });
        });
    })
    .catch((error) => {
      res.send(error);
    });
});

app.post('/api/upgradeStatus/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const queryConfig = {
    text: "SELECT time_accepted FROM order_details WHERE id = $1",
    values: [orderId]
  };
  db.query(queryConfig)
    .then((response) => {
      console.log(response);
      const queryConfig = {
        text: '',
        values: []
      };
      if (!response.rows[0].time_accepted) {
        queryConfig.text = "UPDATE order_details SET time_accepted=NOW() WHERE id = $1 RETURNING time_accepted";
        queryConfig.values = [orderId];
        db.query(queryConfig)
          .then((response) => {
            console.log(response);
            res.send('success: time_accepted');
          })
          .catch((error) => {
            console.error(error);
            res.send('failure: time_accepted');
          });
      } else if (!response.rows[0].time_completed) {
        queryConfig.text = "UPDATE order_details SET time_completed=NOW() WHERE id = $1 RETURNING time_completed";
        queryConfig.values = [orderId];
        db.query(queryConfig)
          .then((response) => {
            console.log(response);
            res.send('success: time_completed');
          })
          .catch((error) => {
            console.error(error);
            res.send('failure: time_completed');
          });
      }
    })
    .catch((error) => {
      console.error(error);
    });
});

// Handles any requests that don't match the ones above
app.get('*', (req, res) => {
  // res.sendFile(path.join(__dirname+'/client/build/index.html'));
  res.send("nah");
});

const port = process.env.PORT || 5000;
app.listen(port);

console.log('App is listening on port ' + port);