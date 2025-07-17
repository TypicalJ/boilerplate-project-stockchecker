'use strict';
const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;

const CONNECTION = process.env.MONGO_URI;

module.exports = function (app) {

  app.route('/api/stock-prices')
    .get(async function (req, res) {
      const stockQuery = req.query.stock;
      const like = req.query.like === 'true';
      const ip = req.ip;

      // Normalize input to array
      const stocks = Array.isArray(stockQuery) ? stockQuery : [stockQuery];

      try {
        const client = await MongoClient.connect(CONNECTION, { useUnifiedTopology: true });
        const db = client.db(); // Default DB from URI
        const likesCollection = db.collection('stock_likes');

        const results = await Promise.all(stocks.map(async symbol => {
          const stock = symbol.toUpperCase();

          // Get price from FCC proxy
          const priceData = await axios.get(`https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stock}/quote`);
          const price = priceData.data.latestPrice;

          // Get or create like record
          let record = await likesCollection.findOne({ stock });

          if (!record) {
            record = { stock, ips: [] };
            await likesCollection.insertOne(record);
          }

          // Handle like logic
          if (like && !record.ips.includes(ip)) {
            await likesCollection.updateOne(
              { stock },
              { $push: { ips: ip } }
            );
            record.ips.push(ip); // So the likes count updates
          }

          return {
            stock,
            price,
            likes: record.ips.length
          };
        }));

        // Format response
        if (results.length === 1) {
          return res.json({ stockData: results[0] });
        } else {
          const rel_likes = results[0].likes - results[1].likes;
          return res.json({
            stockData: [
              {
                stock: results[0].stock,
                price: results[0].price,
                rel_likes: rel_likes
              },
              {
                stock: results[1].stock,
                price: results[1].price,
                rel_likes: -rel_likes
              }
            ]
          });
        }

      } catch (err) {
        console.error(err);
        return res.status(500).send('Internal server error');
      }
    });

};
