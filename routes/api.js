'use strict';
const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;

module.exports = function (app) {
  const client = new MongoClient(process.env.MONGO_URI);

  app.route('/api/stock-prices')
    .get(async function (req, res) {
      const ip = req.ip;
      const { stock, like } = req.query;
      const stocks = Array.isArray(stock) ? stock : [stock];

      try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('likes');

        const results = await Promise.all(stocks.map(async (symbol) => {
          const stockSymbol = symbol.toUpperCase();

          // Fetch stock data
          const response = await axios.get(
            `https://stock-price-checker-proxy.freecodecamp.rocks/v1/stock/${stockSymbol}/quote`
          );
          const price = response.data.latestPrice;

          // Handle likes
          let likesCount = 0;
          const found = await collection.findOne({ stock: stockSymbol });

          if (found) {
            if (like === 'true' && !found.ips.includes(ip)) {
              await collection.updateOne({ stock: stockSymbol }, { $push: { ips: ip } });
              likesCount = found.ips.length + 1;
            } else {
              likesCount = found.ips.length;
            }
          } else {
            await collection.insertOne({ stock: stockSymbol, ips: like === 'true' ? [ip] : [] });
            likesCount = like === 'true' ? 1 : 0;
          }

          return { stock: stockSymbol, price, likes: likesCount };
        }));

        if (results.length === 1) {
          return res.json({ stockData: results[0] });
        }

        const rel_likes_1 = results[0].likes - results[1].likes;
        const rel_likes_2 = results[1].likes - results[0].likes;

        return res.json({
          stockData: [
            { stock: results[0].stock, price: results[0].price, rel_likes: rel_likes_1 },
            { stock: results[1].stock, price: results[1].price, rel_likes: rel_likes_2 }
          ]
        });

      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Server error' });
      } finally {
        await client.close();
      }
    });
};
