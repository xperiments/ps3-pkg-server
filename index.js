const fs = require('fs');
const path = require('path');
const request = require('request');
const jimp = require('jimp');
const express = require('express');

const sonyPkgMagicNumber = 0x7f504b47;
const packagesFolder = './PKGS/';

const ps3db = require('./bdd/ps3-db.json');

let localIP = '0.0.0.0';
let localPort = require('./config.json').port;

// HELPERS

function getServerHost() {
  return `http://${localIP}:${localPort}`;
}

function cuid(id) {
  return id.split('-')[1].split('_')[0];
}

function reverseEndian(x) {
  buf = Buffer.allocUnsafe(4);
  buf.writeUIntLE(x, 0, 4);
  return buf.readUIntBE(0, 4);
}

function escape(str) {
  return str
    .replace(/"/g, '&quot;')
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/&/g, '&amp;');
}
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

function deepMerge(source, mix, { concatArray } = { concatArray: false }) {
  // tslint:disable-next-line:prefer-object-spread
  const output = Object.assign({}, source);
  if (isObject(source) && isObject(mix)) {
    Object.keys(mix).forEach(key => {
      const sourceKey = JSON.parse(JSON.stringify(mix[key]));
      const targetKey = source[key] ? JSON.parse(JSON.stringify(source[key])) : undefined;
      const keySource = { [key]: sourceKey };
      if (isObject(sourceKey)) {
        if (!(key in source)) {
          Object.assign(output, keySource);
        } else {
          output[key] = deepMerge(targetKey, sourceKey, { concatArray });
        }
      } else {
        if (targetKey && Array.isArray(targetKey) && Array.isArray(sourceKey)) {
          Object.assign(output, { [key]: concatArray ? targetKey.concat(sourceKey) : sourceKey });
        } else {
          Object.assign(output, keySource);
        }
      }
    });
  }
  return output;
}

function mergeImages(id) {
  return jimp
    .read('./img/base.png')
    .then(tpl =>
      jimp.read('./img/covers/' + id + '.png').then(cover =>
        jimp.read('./img/dvd.png').then(dvd => {
          cover.opacity(1);
          dvd.opacity(1);
          tpl.composite(cover, 25, 15);
          tpl.composite(dvd, 0, 0);
          return tpl;
        })
      )
    )
    .then(tpl => tpl.quality(100).write('./img/covers/' + id + '.png'))

    .catch(err => {
      console.error(err);
    });
}

function downloadCover(id, url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const sendReq = request.get(url);

    // verify response code
    sendReq.on('response', response => {
      if (response.statusCode !== 200) {
        return fs.unlink(dest, () => {
          fs.createReadStream('img/empty_dvd.png').pipe(fs.createWriteStream(dest));
          resolve();
        });
      }

      sendReq.pipe(file);
    });

    // close() is async, call cb after close completes
    file.on('finish', () => {
      file.close();
      mergeImages(id).then(resolve);
    });

    // check for request errors
    sendReq.on('error', err => {
      fs.unlink(dest, () => {
        fs.createReadStream('img/empty_dvd.png').pipe(fs.createWriteStream(dest));
        resolve();
      });
    });

    file.on('error', err => {
      fs.unlink(dest, () => {
        fs.createReadStream('img/empty_dvd.png').pipe(fs.createWriteStream(dest));
        resolve();
      });
    });
  });
}

// HELPERS

function getPkgFiles() {
  return fs.readdirSync(packagesFolder).filter(file => path.extname(file) === '.pkg');
}

function getPackageContentId(pkgFile) {
  return new Promise(function(resolve, reject) {
    fs.open(pkgFile, 'r', (status, fd) => {
      if (status) {
        reject(status.message);
        return;
      }
      const buffer = new Buffer(84);
      fs.read(fd, buffer, 0, 84, 0, function(err, num) {
        const header = reverseEndian(buffer.readInt32LE());
        if (sonyPkgMagicNumber === header) {
          const title = buffer.slice(48, 48 + 36);
          resolve({ file: pkgFile, contentId: title.toString(), cuid: cuid(title.toString()) });
        }
      });
    });
  });
}

function getPkgMetadata(pkg) {
  return { ...pkg, metadata: ps3db[pkg.cuid] };
}

function getMetadata() {
  const pkgFiles = getPkgFiles();
  const pkgFilesContentIds = pkgFiles.map(pkgFile => {
    return getPackageContentId(`PKGS/${pkgFile}`);
  });
  return Promise.all(pkgFilesContentIds).then(values => {
    const metadataPkgs = values.map(getPkgMetadata);
    return metadataPkgs;
  });
}

function getPackageLinkXml(metadata) {
  return `<XMBML version="1.0">
	<View id="package_link">
		<Attributes>
			<Table key="pkg_main">
				<Pair key="icon">
					<String>${getServerHost()}/img/net-connect.png</String>
				</Pair>
				<Pair key="title">
					<String>LAN Package Installer</String>
				</Pair>
				<Pair key="info">
					<String>Download and Install Packages from webserver</String>
				</Pair>
				<Pair key="ingame">
					<String>disable</String>
				</Pair>
			</Table>
		</Attributes>
		<Items>
			<Query class="type:x-xmb/folder-pixmap" key="pkg_main" attr="pkg_main" src="#pkg_items" />
		</Items>
    </View>
    ${metadata
      .map((pkgData, index) => {
        return `<View id="pkgs_${index}">
              <Attributes>
                  <Table key="link${index}">
                      <Pair key="info">
                          <String>net_package_install</String>
                      </Pair>
                      <Pair key="pkg_src">
                          <String>${getServerHost()}/${pkgData.file}</String>
                      </Pair>
                      <Pair key="pkg_src_qa">
                          <String>${getServerHost()}/${pkgData.file}</String>
                      </Pair>
                      <Pair key="content_name">
                          <String>${escape(pkgData.metadata ? pkgData.metadata.name : pkgData.file)}</String>
                      </Pair>
                      <Pair key="content_id">
                          <String>${pkgData.contentId}</String>
                      </Pair>
                      <Pair key="prod_pict_path">
                          <String>${getServerHost()}/img/tape-deck.png</String>
                      </Pair>
                      <Pair key="title">
                          <String>${escape(pkgData.metadata ? pkgData.metadata.name : pkgData.file)}</String>
                      </Pair>
                  </Table>
              </Attributes>
              <Items>
                  <Item class="type:x-xmb/xmlnpsignup" key="link${index}" attr="link${index}" />
              </Items>
          </View>`;
      })
      .join()}
 	<View id="pkg_items">
        <Attributes>
        ${metadata
          .map((pkgData, index) => {
            return `<Table key="pkg_file_${index}">
            <Pair key="ingame">
                <String>disable</String>
            </Pair>
            <Pair key="info">
                <String>${
                  pkgData.metadata && pkgData.metadata.description
                    ? escape(pkgData.metadata.description.replace(/(<([^>]+)>)/gi, '')).substring(0, 128) + '...'
                    : ''
                }</String>
            </Pair>
            <Pair key="icon">
                <String>${getServerHost()}/img/covers/${pkgData.contentId}.png</String>
            </Pair>
            <Pair key="title">
                <String>${escape(pkgData.metadata ? pkgData.metadata.name : pkgData.file) || pkgData.cuid}</String>
            </Pair>
        </Table>`;
          })
          .join()}
            <Table key="package_link_downloader">
				<Pair key="icon">
					<String>${getServerHost()}/img/floppy-disc.png</String>
				</Pair>
				<Pair key="title">
					<String>Update Package Link</String>
				</Pair>
				<Pair key="info">
					<String>Download updated version from ${getServerHost()}</String>
				</Pair>
				<Pair key="module_name">
					<String>webrender_plugin</String>
				</Pair>
				<Pair key="module_action">
					<String>${getServerHost()}/package_link_download.html</String>
				</Pair>
			</Table>
        </Attributes>
        <Items>
            <Query class="type:x-xmb/module-action" key="package_link_downloader" attr="package_link_downloader" />
            ${metadata
              .map((pkgData, index) => {
                return `            <Query class="type:x-xmb/folder-pixmap" key="pkg_file_${index}" attr="pkg_file_${index}" src="#pkgs_${index}" />`;
              })
              .join('')}
        </Items>
    </View>
</XMBML>`;
}

function getCovers(metadata) {
  const coverPromises = metadata.map(pkgData => {
    return downloadCover(
      pkgData.contentId,
      `${pkgData.metadata ? pkgData.metadata.thumbnail : getServerHost() + '/img/empty_dvd.png'}?w=145`,
      `img/covers/${pkgData.contentId}.png`
    );
  });
  return Promise.all(coverPromises);
}

function startServer() {
  const app = express();
  app.use('/img', express.static(__dirname + '/img'));
  app.use('/PKGS', express.static(__dirname + '/PKGS'));
  app.use('/js', express.static(__dirname + '/js'));
  app.get('/package_link_download.html', function(req, res) {
    res.sendFile(path.join(__dirname + '/package_link_download.html'));
  });
  app.get('/demo.html', function(req, res) {
    res.sendFile(path.join(__dirname + '/demo.html'));
  });
  // define a route to download a file
  app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
  });
  app.get('/download', (req, res) => {
    res.set({ 'Content-Type': 'application/octet-stream', Location: '/demo.html' });

    res.download('./package_link.xml', 'package_link.downloaded');
  });
  app.listen(localPort, () => {
    console.log(`[ps3-pkg-server started] at: ${getServerHost()}`);
  });
}

function main() {
  require('dns').lookup(require('os').hostname(), function(err, address) {
    if (err) {
      console.log(err.message);
    } else {
      localIP = address;
      getMetadata().then(metadata => {
        getCovers(metadata).then(() => {
          fs.writeFileSync('package_link.xml', getPackageLinkXml(metadata), 'utf8');
          startServer();
        });
      });
    }
  });
}
main();
