const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cookiesMiddleware = require('universal-cookie-express');
const cors = require("cors");
const WebSocket = require('ws');
const { Pool } = require('pg');
const dbParams = require('./lib/db.js');
const http = require('http');
const db = new Pool(dbParams);
db.connect();

const port = process.env.PORT || 8080
const app = express()
const httpServer = http.createServer(app)
const wss = new WebSocket.Server({
  'server': httpServer
});
httpServer.listen(port);

wss.on('connection', function(ws) {
  console.log('yay');
  wss.onmessage = function(event) {
    console.log(event);
  };
  ws.send('something');
});

const paid = function(table_id, success) {
  console.log(wss.clients);
  wss.clients.forEach(function(client) {
    console.log(client);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        table_id: table_id,
        success: success
      }));
      console.log('sent');
    }
  });
};

const newItem = function() {
  console.log('reached new item');
  wss.clients.forEach(function(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send('new item');
    }
  });
};

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.use(bodyParser.json());
app.use(cors());
app.use(cookiesMiddleware());
app.use(morgan('dev'));

app.get('/api/getTables/:restaurantId', (req, res) => {
  wss.onmessage = function(event) {
    console.log(event);
  };
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
      res.send(response.rows);
    })
    .catch((error) => {
      res.send(error);
    });
});

app.get('/api/getActiveTableItems/:tableId', (req, res) => {
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
      const queryConfig = {
        text: '',
        values: []
      };
      if (!response.rows[0].time_accepted) {
        queryConfig.text = "UPDATE order_details SET time_accepted=NOW() WHERE id = $1 RETURNING time_accepted";
        queryConfig.values = [orderId];
        db.query(queryConfig)
          .then((response) => {
            res.send('success: time_accepted');
          })
          .catch((error) => {
            res.send('failure: time_accepted');
          });
      } else if (!response.rows[0].time_completed) {
        queryConfig.text = "UPDATE order_details SET time_completed=NOW() WHERE id = $1 RETURNING time_completed";
        queryConfig.values = [orderId];
        db.query(queryConfig)
          .then((response) => {
            res.send('success: time_completed');
          })
          .catch((error) => {
            res.send('failure: time_completed');
          });
      }
    })
    .catch((error) => {
      console.error(error);
    });
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
      console.log(`restaurantId: ${restaurantId}`);
      res.send({ restaurantId });
    })
    .catch((error) => {
      res.send("error");
    });
});

app.post('/logout', (req, res) => {
  res.send(`/admin`);
});

app.get('/:table_id', (req, res) => { //creates new order is table is empty or adds to current order
  const queryConfig = {
    text: "SELECT current_number_customers FROM tables WHERE id = $1",
    values: [req.params.table_id]
  };
  db.query(queryConfig)
    .then((response) => {
      // const restaurantId = response.rows[0].id;
      const customers = response.rows[0].current_number_customers;
      console.log(customers);
      if (customers === 0) {
        const queryConfig = {
          text: "SELECT * FROM orders WHERE table_id = $1 AND completed = FALSE",
          values: [req.params.table_id]
        };
        db.query(queryConfig)
          .then((response) => {
            console.log('inside customers = 0')
            if (!response.rows[0]) {
              const queryConfig = {
                text: "INSERT into orders (table_id, completed, payment_customers, time_started) VALUES ($1, FALSE, 0, NOW()) RETURNING id",
                values: [req.params.table_id]
              };
              db.query(queryConfig)
                .then(
                  (response) => {
                    console.log('inside insert')
                    const queryConfig = {
                      text: `UPDATE tables SET current_number_customers = 1 WHERE id = $1`,
                      values: [req.params.table_id]
                    };
                    db.query(queryConfig);
                    res.send(response.rows[0]);
                  });
            } else {
              const queryConfig = {
                text: `UPDATE tables SET current_number_customers = 1 WHERE id = $1`,
                values: [req.params.table_id]
              };
              console.log('inside order is there')
              db.query(queryConfig);
              res.send(response.rows[0]);
            }
          })
      } else {
        const queryConfig = {
          text: "SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE",
          values: [req.params.table_id]
        };
        db.query(queryConfig)
          .then((response) => {
            const queryConfig = {
              text: `UPDATE tables SET current_number_customers = ${customers + 1} WHERE id = $1`,
              values: [req.params.table_id]
            };
            db.query(queryConfig);
            res.send(response.rows[0]);
          });
      }
      // req.session.user = restaurantId;
      // res.send(`/restaurant/${restaurantId}`);
    });
});

app.post('/:table_id/order', (req, res) => { // accepts array called order [{name, quantity}] and adds to database
  const queryConfig = {
    text: "SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE",
    values: [req.params.table_id]
  };
  console.log(req.body);
  console.log(`table id: ${req.params.table_id}`);
  db.query(queryConfig)
    .then((response) => {
      console.log(`order id: ${response.rows[0].id}`);
      console.log(`body: ${req.body.order}`);
      for (let item of req.body.order) {
        const queryConfig = {
          text: "INSERT into order_details (item_id, order_id, quantity, paid, time_ordered, divide) VALUES ($1, $2, $3, FALSE, NOW(), 0)",
          values: [item.id, response.rows[0].id, item.quantity]
        };
        db.query(queryConfig)
          .then(() => {
            console.log(`item id: ${item.id}, item quantity: ${item.quantity}`);
            if (req.body.order[req.body.order.length - 1].id === item.id) {
              console.log("success");
              newItem();
              res.send("success");
            }
          });
      }
    });
});

app.post('/:table_id/ordermore', (req, res) => {
  const queryConfig = {
    text: "UPDATE tables SET current_number_customers = ((SELECT current_number_customers FROM tables WHERE id = $1) - 1) WHERE id = $1",
    values: [req.params.table_id]
  };
  console.log('test')
  db.query(queryConfig)
    .then((response) => {
      res.send('success')
    })
})

app.get('/:table_id/order', (req, res) => {
  const queryConfig = {
    text: "SELECT item_id, quantity, items.name, items.price_cents, order_details.id FROM order_details JOIN items ON items.id = item_id WHERE order_id = (SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE)",
    values: [req.params.table_id]
  };
  db.query(queryConfig)
    .then(response => {
      res.send(response.rows);
    });
});

app.get('/:table_id/finish', (req, res) => { // ends order
  const queryConfig = {
    text: "UPDATE orders SET completed = true WHERE table_id = $1 AND completed = FALSE",
    values: [req.params.table_id]
  };
  db.query(queryConfig)
    .then(response => {
      res.send(success)
    })
})

app.post('/:table_id/pay/confirm', (req, res) => {
  const queryConfig = {
    text: "INSERT INTO payments (order_id, payment_cents) VALUES ((SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE), $2)",
    values: [req.params.table_id, req.body.price]
  };
  db.query(queryConfig)
    .then(response => {

      const queryConfig = {
        text: "SELECT * FROM payments WHERE order_id = (SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE)",
        values: [req.params.table_id]
      };
      db.query(queryConfig)
        .then((response) => {
          let numberOfPayments = response.rows[0].length
          const queryConfig = {
            text: "SELECT * FROM payments WHERE order_id = (SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE)",
            values: [req.params.table_id]
          };
          db.query(queryConfig)
        })
      res.send(success)
    })
})

app.get('/api/:restaurant_id/menu', (req, res) => { // gets menu from database
  const queryConfig = {
    text: "SELECT name, id, image FROM categories WHERE restaurant_id = $1 AND active ",
    values: [req.params.restaurant_id]
  };
  db.query(queryConfig)
    .then((response) => {
      let categories = response.rows;
      const queryConfig = {
        text: "SELECT * FROM categories JOIN items ON categories.id = items.category_id WHERE restaurant_id = $1",
        values: [req.params.restaurant_id]
      };
      db.query(queryConfig)
        .then((response) => {
          let menu = [];
          for (let category of categories) {
            let categoryItems = response.rows.filter(item => item.category_id === category.id);
             menu.push({category: category.name, items: categoryItems, image: category.image})
          }
          res.send(menu);
        });
    });
});

app.post('/api/:restaurant_id/menu', (req, res) => { //recieves [{category,items}, {category,items}] adds it to database and sets old items active to false
  const queryConfig = {
    text: "UPDATE items SET active = FALSE FROM categories WHERE categories.restaurant_id = $1",
    values: [req.params.restaurant_id]
  };
  db.query(queryConfig)
    .then(() => {
      const queryConfig = {
        text: "UPDATE categories SET active = FALSE WHERE restaurant_id = $1",
        values: [req.params.restaurant_id]
      };
      db.query(queryConfig)
        .then(() => {
          let categoryString = 'INSERT INTO categories (restaurant_id, name, active) VALUES ';
          for (let category of req.body.menu) {
            categoryString += `( $1, '${category.category}', true),`;
          }
          categoryString = categoryString.slice(0, -1);
          categoryString += ' RETURNING id';
          const queryConfig = {
            text: categoryString,
            values: [req.params.restaurant_id]
          };
          db.query(queryConfig)
            .then((response) => {
              for (let index = 0; index < response.rows.length; index++) {
                if (req.body.menu[index].items) {
                  let item_string = 'INSERT INTO items (category_id, name, price_cents, image, active) VALUES '
                  for (let item of req.body.menu[index].items) {
                    item_string += `('${response.rows[index].id}', '${item.name}', '${item.price_cents}', '${item.image}' ,true),`
                  }
                  item_string = item_string.slice(0, -1)
                  db.query(item_string)
                    .then(() => {
                      if (index === response.rows.length - 1) {
                        res.send("success")
                      }
                    })
                } else {
                  if (index === response.rows.length - 1) {
                    res.send("success")
                  }
                }
              }
            });
        });
    });
});

app.post('/calculate_total', (req, res) => {
  let items = req.body.items;
  let price = 0;

  params = [];
  for(let i = 1; i <= items.length; i++) {
  params.push('$' + i);
  }
  const queryConfig = {
    text: 'SELECT name,price_cents, quantity, divide FROM order_details JOIN items ON items.id = item_id WHERE order_details.id IN (' + params.join(',') + ')',
    values: [...items]
  };
  db.query(queryConfig)
    .then((response) => {
      for (item of response.rows) {
        price += (item.price_cents * item.quantity) / item.divide
      }
      res.send((price / 100).toFixed(2))
    })
})
app.post('/calculate_payment', (req, res) => {
  let items = req.body.items;
  params = [];
  for(let i = 1; i <= items.length; i++) {
  params.push('$' + i);
  }
  const queryConfig = {

    text: 'SELECT name,price_cents, quantity, divide FROM order_details JOIN items ON items.id = item_id WHERE order_details.id IN (' + params.join(',') + ')',
    values: [...items]
  };
  db.query(queryConfig)
    .then((response) => {
      res.send(response.rows)
    })
})
app.get('/:table_id/pay/reset', (req, res) => {
  const queryConfig = {
    text: "SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE",
    values: [req.params.table_id]
  };
  console.log(`table id: ${req.params.table_id}`);
  db.query(queryConfig)
    .then((response) => {
      let order_id = response.rows[0].id;
      const queryConfig = {
        text: "UPDATE order_details SET paid=FALSE, divide=0 WHERE order_id = $1",
        values: [order_id]
      };
      db.query(queryConfig)
        .then((response) => {
          const queryConfig = {
            text: "UPDATE orders SET payment_customers = 0 WHERE id = $1",
            values: [order_id]
          };
          db.query(queryConfig)
            .then(() => {
              res.send('success')
            })
        })
    })
})
app.post('/:table_id/pay', (req, res) => { // recieves array of order_datails.id [1,3,5] and updates in database
  let paid_items = req.body.items;
  const queryConfig = {
    text: "SELECT id FROM orders WHERE table_id = $1 AND completed = FALSE",
    values: [req.params.table_id]
  };
  console.log(`table id: ${req.params.table_id}`);
  db.query(queryConfig)
    .then((response) => {
      let order_id = response.rows[0].id
      let inserted = 0;
      for (item of paid_items) {
        const queryConfig = {
          text: "UPDATE order_details SET paid=TRUE, divide=((SELECT divide FROM order_details WHERE id = $1) + 1) WHERE id = $1",
          values: [item]
        };
        db.query(queryConfig)
          .then(() => {
            inserted += 1;
            console.log("added ", item)
            if (paid_items.length === inserted) {
              const queryConfig = {
                text: "SELECT * FROM order_details WHERE order_id = $1 AND PAID = FALSE",
                values: [order_id]
              };
              console.log("order id in select ", order_id)
              db.query(queryConfig)
                .then((response) => {
                  if (response.rows.length === 0) {
                    paid(req.params.table_id, true)
                    res.send("success");
                  } else {
                    // console.log(response.rows)
                    const queryConfig = {
                      text: "UPDATE orders SET payment_customers =((SELECT payment_customers FROM orders WHERE id = $1) + 1) WHERE id = $1",
                      values: [order_id]
                    };
                    db.query(queryConfig)
                      .then(() => {
                        const queryConfig = {
                          text: "SELECT payment_customers, current_number_customers FROM orders JOIN tables ON tables.id = table_id WHERE orders.id = $1",
                          values: [order_id]
                        };
                        db.query(queryConfig)
                          .then((response) => {
                            console.log(response.rows[0].payment_customers + " " + response.rows[0].current_number_customers)
                            if (response.rows[0].payment_customers === response.rows[0].current_number_customers) {
                              paid(req.params.table_id, false)
                              res.send("please try again")
                            } else {
                              res.send("not paid")
                            }
                          })
                      })
                  }
                })
            }
          })
      }
    })
})

// Handles any requests that don't match the ones above
// app.get('*', (req, res) => {
//   // res.sendFile(path.join(__dirname+'/client/build/index.html'));
//   console.log('not available')
//   // res.send(101)
//   res.send("nah");
// });

// const port = process.env.PORT || 5000;
// app.listen(port);

console.log('App is listening on port ' + port);
