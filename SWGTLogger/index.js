const request = require('request');
const fs = require('fs');
const path = require('path');
const pluginName = 'SWGTLogger';

module.exports = {
  defaultConfig: {
    enabled: true,
    saveToFile: false,
    apiKey: '',
    siteURL: 'https://swgt.io'
  },
  defaultConfigDetails: {
    saveToFile: {label: 'Save to file as well?'},
    apiKey: { label: 'SWGT API key (On your SWGT profile page)', type: 'input' },
    siteURL: { label: 'API URL (default https://swgt.io)', type: 'input' }
  },
  pluginName,
  pluginDescription: 'Automatically upload guild battle information to SWGT.',
  init(proxy, config) {
    if (config.Config.Plugins[pluginName].enabled) {
      config.Config.Plugins[pluginName].apiKey = config.Config.Plugins[pluginName].apiKey;

      if (!config.Config.Plugins[pluginName].apiKey) {
        proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Unable to initialize due to missing API key. Please go into settings and enter an API key for the SWGTLogger, exit SWEX and reopen it to use SWGTLogger.' });
      } else {
        proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: 'Initialized API key: ' + config.Config.Plugins[pluginName].apiKey });
        
        //Guild Info
        proxy.on('getGuildAttendInfo', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-getGuildAttendInfo-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildInfo', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildInfo-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });

        //Guild War Hooks
        proxy.on('GetGuildWarBattleLogByGuildId', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildWarBattleLogByGuildId-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildWarBattleLogByWizardId', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildWarBattleLogByWizardId-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildWarMatchLog', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildWarMatchLog-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildWarRanking', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildWarRanking-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });

        //Siege
        proxy.on('GetGuildSiegeBattleLogByWizardId', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildSiegeBattleLogByWizardId-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildSiegeBattleLog', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildSiegeBattleLog-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildSiegeMatchupInfo', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildSiegeMatchupInfo-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildSiegeBaseDefenseUnitList', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildSiegeBaseDefenseUnitList-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildSiegeBaseDefenseUnitListPreset', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildSiegeBaseDefenseUnitListPreset-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildSiegeRankingInfo', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildSiegeRankingInfo-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        
        /*
        //Lab
        proxy.on('GetGuildMazeContributeList', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildMazeContributeList-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        proxy.on('GetGuildMazeMemberInfoList', (req, resp) => {
          if(config.Config.Plugins[pluginName].saveToFile){
            this.writeToFile(proxy, req, resp, 'swgt-GetGuildMazeMemberInfoList-'+new Date().getTime()+'.json');
          }
          this.uploadToWebService(proxy, config, req, resp);
        });
        */
      }
    }
  },
  uploadToWebService(proxy, config, req, resp) {
    const { command } = req;

    var thisSiteURL = "https://swgt.io";
    if(config.Config.Plugins[pluginName].siteURL != "" && config.Config.Plugins[pluginName].siteURL.includes("swgt.io"))
      thisSiteURL = config.Config.Plugins[pluginName].siteURL;

    if(
        "https://ninebandits.swgt.io" == thisSiteURL && 
        (
            "fbcc90e8-8ca7-49a1-a6c0-03bfba2b7774" == config.Config.Plugins[pluginName].apiKey || 
            "fcad1893-5b53-49f3-b879-6627670adacf" == config.Config.Plugins[pluginName].apiKey
        )
      ){
      uploadToDevWebService(proxy, config, req, resp);
    }
    let options = {
      method: 'post',
      uri: thisSiteURL+'/api/v1?apiKey='+config.Config.Plugins[pluginName].apiKey,
      json: true,
      //body: JSON.stringify(resp, true, 2)
      body: resp
    };

    request(options, (error, response) => {
      if (error) {
        proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Error: ${error.message}` });
        return;
      }

      if (response.statusCode === 200) {
        proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: `${command} uploaded successfully` });
      } else {
        proxy.log({
          type: 'error',
          source: 'plugin',
          name: this.pluginName,
          message: `Upload failed: Server responded with code: ${response.statusCode} = ${response.body}`
        });
      }
    });
  },
  uploadToDevWebService(proxy, config, req, resp) {
    const { command } = req;

    let options = {
      method: 'post',
      uri: 'https://cerusa.swgt.io/api/v1?apiKey='+config.Config.Plugins[pluginName].apiKey,
      json: true,
      //body: JSON.stringify(resp, true, 2)
      body: resp
    };

    request(options, (error, response) => {
      if (error) {
        proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Error: ${error.message}` });
        return;
      }

      if (response.statusCode === 200) {
        proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: `${command} uploaded successfully` });
      } else {
        proxy.log({
          type: 'error',
          source: 'plugin',
          name: this.pluginName,
          message: `Upload failed: Server responded with code: ${response.statusCode} = ${response.body}`
        });
      }
    });
  },
  writeToFile(proxy, req, resp, filename) {
    let outFile = fs.createWriteStream(path.join(config.Config.App.filesPath, filename), {
      flags: 'w',
      autoClose: true
    });

    outFile.write(JSON.stringify(resp, true, 2));
    outFile.end();
    proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: 'Saved data to '.concat(filename) });
  }
};
