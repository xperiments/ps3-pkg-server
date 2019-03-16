const csv = require("csvtojson");
const fs = require("fs");

const nopaystation = "./bdd/sources/PS3_GAMES.tsv";
const psndl = "./bdd/sources/psndl.net";

function cuid(id) {
  return id.split("-")[1].split("_")[0];
}

function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(source, mix, { concatArray } = { concatArray: false }) {
  // tslint:disable-next-line:prefer-object-spread
  const output = Object.assign({}, source);
  if (isObject(source) && isObject(mix)) {
    Object.keys(mix).forEach(key => {
      const sourceKey = JSON.parse(JSON.stringify(mix[key]));
      const targetKey = source[key]
        ? JSON.parse(JSON.stringify(source[key]))
        : undefined;
      const keySource = { [key]: sourceKey };
      if (isObject(sourceKey)) {
        if (!(key in source)) {
          Object.assign(output, keySource);
        } else {
          output[key] = deepMerge(targetKey, sourceKey, { concatArray });
        }
      } else {
        if (targetKey && Array.isArray(targetKey) && Array.isArray(sourceKey)) {
          Object.assign(output, {
            [key]: concatArray ? targetKey.concat(sourceKey) : sourceKey
          });
        } else {
          Object.assign(output, keySource);
        }
      }
    });
  }
  return output;
}

function getExternalDBThrumb(contentId, region) {
  var language = "en";
  let countryAbbv = region;
  switch (region) {
    case "EU": {
      countryAbbv = "GB";
      break;
    }
    case "JP": {
      language = "ja";
      countryAbbv = "JP";
      break;
    }
    case "ASIA": {
      countryAbbv = "SG";
      break;
    }
    default:
      countryAbbv = region;
  }
  return `http://store.playstation.com/store/api/chihiro/00_09_000/container/${countryAbbv}/${language}/19/${contentId}/1534563384000/image`;
}

csv({ delimiter: "\t" })
  .fromFile(nopaystation)
  .then(nopaystationObj => {
    csv({ delimiter: ";" })
      .fromString(
        "Title ID;Name;type;Region;PKG direct link;RAP;FID;Description;Provider\n" +
          fs.readFileSync(psndl, "utf8")
      )
      .then(psndlObj => {
        const all = [...nopaystationObj, ...psndlObj];
        const result = all.reduce((acc, current) => {
          const {
            Name: name,
            Region: region,
            Description: description,
            "Content ID": contentId,
            RAP: contentIdAlternate
          } = current;
          const finalContentId =
            contentId || contentIdAlternate.replace(".rap", "");

          if (finalContentId) {
            const targetObj = acc[cuid(finalContentId)];
            acc[cuid(finalContentId)] = deepMerge(targetObj ? targetObj : {}, {
              name,
              region,
              ...(description ? { description } : undefined),
              contentId: finalContentId,
              thumbnail: getExternalDBThrumb(finalContentId, region)
            });
          }
          return acc;
        }, {});
        const psnDb = JSON.parse(
          fs.readFileSync("./bdd/sources/psn-db.json", "utf8")
        );
        const output = deepMerge(result, psnDb);
        console.log(`PS3-DB has ${Object.keys(result).length} Games`);
        fs.writeFileSync(
          "./bdd/ps3-db.json",
          JSON.stringify(deepMerge(result, psnDb)),
          "utf8"
        );
      });
  });
