# ps3-pkg-server

A small nodejs program to help with generating a package_link.xml file for
transferring files between your (\*nix) computer and your HAN enabled PlayStation3
using a network.

## Installation

Clone this repository.

- `npm install` will install the required dependencies & parse the provided game data
- `npm run start` to start the server

## Configuration

- Open `config.json` and change the default server port if needed

## Provide some PKG's

Put your signed packages into the `PKGS` folder

## First time only or changed server port

- The first time you run the server it will generate a `package_link.xml` file in the project root directory
- Copy this file to the root folder of a USB and connect it to your PS3 system
- Navigate to the "Package Manager/LAN Package Installer" to see the new XMB menu

## Every time we add some new PKG files

- Stop the server Ctrl+C
- Re-run the server with `npm run start`
- Use the first menu item `Update Package Link`
- Navigate to the "Package Manager/LAN Package Installer/Update Package Link" and click on it
- Click on the `Download updated package_link` to download a temporally copy of the file
- Click on `Rename & Reboot` rename the file & reboot system

## Game Data

- Provided game data comes from the nopaystation & psndl
- Download more detailed game data (scrapping from psn stores) runing `npm run import-psn`. Pay attention that this process takes some time. If for some reason it breaks, rerun it, as it caches the request for some time
