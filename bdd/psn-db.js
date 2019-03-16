const request = require('request');
const fs = require('fs');

function logStoreStart(store) {
  console.log('');
  console.log('-'.repeat(40));
  console.log(`Start Download of ${store} store game info`);
  console.log('-'.repeat(40));
}
function logStoreCompleted(store) {
  console.log('');
  console.log('-'.repeat(40));
  console.log(`Download of ${store} store complete`);
  console.log('-'.repeat(40));
  console.log('');
  console.log('');
}
function loadStoreData(target, region, offset, cb) {
  const storeRegionIds = {
    US: { store: 'STORE-MSF77008-PS3ALLPS3GAMES', locale: 'en/US' },
    'US Digital': { store: 'STORE-MSF77008-PS3DIGITALPS3', locale: 'en/US' },
    EU: { store: 'STORE-MSF75508-PLATFORMPS3', locale: 'en/GB' },
    'EU Digital': { store: 'STORE-MSF75508-MRKTDIGITAL', locale: 'en/GB' },
    JP: { store: 'PN.CH.JP-PN.CH.MIXED.JP-PS3GAMEADD', locale: 'ja/JP' },
    SG: { store: 'STORE-MSF86012-PS3GAMES', locale: 'en/SG' }
  };

  const locale = storeRegionIds[region].locale;
  const store = storeRegionIds[region].store;

  request.get(
    `https://store.playstation.com/valkyrie-api/${locale}/999/container/${store}?platform=ps3&size=30&bucket=games&start=${offset}`,
    { timeout: 145000 },
    function(error, response, body) {
      if (!error && response.statusCode == 200) {
        const results = JSON.parse(body.replace('/**/', ''));
        normalize(target, results, region, offset, cb);
      }
    }
  );
}
logStoreStart('US');
loadStoreData({}, 'US', 0, usData => {
  logStoreCompleted('US');
  logStoreStart('US Digital');
  loadStoreData(usData, 'US Digital', 0, usDataDigital => {
    logStoreCompleted('US Digital');
    logStoreStart('EU');
    loadStoreData(usDataDigital, 'EU', 0, euData => {
      logStoreCompleted('EU');
      logStoreStart('EU Digital');
      loadStoreData(euData, 'EU Digital', 0, euDataDigital => {
        logStoreCompleted('EU Digital');
        logStoreStart('JP');
        loadStoreData(euDataDigital, 'JP', 0, jpData => {
          logStoreCompleted('JP');
          logStoreStart('SG');
          loadStoreData(jpData, 'SG', 0, asiaData => {
            logStoreCompleted('SG');
            fs.writeFileSync(`./bdd/sources/psn-db.json`, JSON.stringify(asiaData), 'utf8');
            console.log('PSN Database saved to /sources/psn-db.json');
          });
        });
      });
    });
  });
});

function getGameObj(attributes, region, contentId) {
  const {
    name,
    'long-description': description,
    'thumbnail-url-base': thumbnail,
    'media-list': mediaList
  } = attributes;

  return {
    contentId,
    name,
    description,
    thumbnail,
    region: region.substring(0, 2),
    screenshots: mediaList ? (mediaList.screenshots ? mediaList.screenshots : undefined) : undefined
  };
}

function normalize(target, db, region, offset, cb) {
  const totalGames = db.data.attributes['total-results'];
  const currentGames = db.data.relationships.children.data;
  const includedData = db.included.reduce((acc, game) => {
    if (game.id) {
      acc[game.id] = getGameObj(game.attributes, region, game.id);
    }
    return acc;
  }, {});
  const result = currentGames.reduce((acc, game) => {
    const cuid = game.id.split('-')[1].split('_')[0];
    acc[cuid] = includedData[game.id];
    return acc;
  }, {});

  target = { ...target, ...result };
  console.log(`(${offset}/${totalGames}) Downloading games for ${region} store`);
  if (offset + 30 < totalGames) {
    loadStoreData(target, region, offset + 30, cb);
  } else {
    cb(target);
  }
}
