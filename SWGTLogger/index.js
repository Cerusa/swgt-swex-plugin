const request = require('request');
const fs = require('fs');
const path = require('path');
const pluginName = 'SWGTLogger';

module.exports = {
  defaultConfig: {
    enabled: true,
    saveToFile: false,
    sendCharacterJSON: true,
    apiKey: '',
    siteURL: ''
  },
  defaultConfigDetails: {
    saveToFile: {label: 'Save to file as well?'},
    sendCharacterJSON: {label: 'Send Character JSON?'},
    apiKey: { label: 'SWGT API key (On your SWGT profile page)', type: 'input' },
    siteURL: { label: 'SWGT API URL  (On your SWGT profile page)', type: 'input' }
  },
  pluginName,
  pluginDescription: 'For SWGT Patreon subscribers to automatically '+
    'upload various Summoners War data. Enable Character JSON to automatically update '+
    'your guild\'s members and your player\'s units/runes/artifacts',
  init(proxy, config) {
    cache={};

    //Character JSON and Guild Member List
    proxy.on('HubUserLogin', (req, resp) => {
      if (!config.Config.Plugins[pluginName].sendCharacterJSON) return;
      
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });

    //Guild Info
    proxy.on('getGuildAttendInfo', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildInfo', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });

    //Guild War Hooks
    proxy.on('GetGuildWarBattleLogByGuildId', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildWarBattleLogByWizardId', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildWarMatchLog', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildWarRanking', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });

    //Siege
    proxy.on('GetGuildSiegeBattleLogByWizardId', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildSiegeBattleLog', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildSiegeMatchupInfo', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildSiegeBaseDefenseUnitList', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildSiegeBaseDefenseUnitListPreset', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildSiegeRankingInfo', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });

    /*
    //Lab
    proxy.on('GetGuildMazeContributeList', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    proxy.on('GetGuildMazeMemberInfoList', (req, resp) => {
      this.writeToFile(proxy, req, resp);
      if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
      this.uploadToWebService(proxy, config, req, resp);
    });
    */
  },
  hasAPISettings(config){
    if (!config.Config.Plugins[pluginName].enabled) return false;

    if (!config.Config.Plugins[pluginName].apiKey){
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Missing API key.' });
      return false;
    } 
    if (!config.Config.Plugins[pluginName].siteURL){
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Missing Site URL.' });
      return false;
    };
    if(!config.Config.Plugins[pluginName].siteURL.includes("swgt.io")){
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Invalid Site URL.' });
      return false;
    }
    return true;
  },
  hasCacheMatch(proxy, config, req, resp, cache) {
    if (!this.hasAPISettings(config)) return;

    action = resp['command']
    if ('log_type' in resp) {action += '_' + resp['log_type']};

    if ('ts_val' in resp) {delete resp['ts_val']};
    if(
        action != 'HubUserLogin' && 
        action != 'VisitFriend' && 
        action != 'GetGuildWarRanking' && 
        action != 'GetGuildSiegeRankingInfo'
      ){
      if ('tvalue' in resp) {delete resp['tvalue']};
    }
    if ('tvaluelocal' in resp) {delete resp['tvaluelocal']};
    //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Response: " + JSON.stringify(resp) });
    if (!(action in cache)) {
      proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Not in cache:  " + action });
    } else if (cache[action] == JSON.stringify(resp)) {
      proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Matched cache:  " + action });
      return true;
    } else {
      proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "No match cache:  " + action });
    };
    cache[action] = JSON.stringify(resp);
    return false;
  },
  uploadToWebService(proxy, config, req, resp) {
    if(!this.hasAPISettings(config)) return;
    const { command } = req;

    let options = {
      method: 'post',
      uri: config.Config.Plugins[pluginName].siteURL+'/api/v1?apiKey='+config.Config.Plugins[pluginName].apiKey,
      json: true,
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
  writeToFile(proxy, req, resp) {
    if(!config.Config.Plugins[pluginName].enabled) return;
    if(!config.Config.Plugins[pluginName].saveToFile) return;
    let filename = 'swgt-'+resp['command']+'-'+new Date().getTime()+'.json';
    let outFile = fs.createWriteStream(path.join(config.Config.App.filesPath, filename), {
      flags: 'w',
      autoClose: true
    });

    outFile.write(JSON.stringify(resp, true, 2));
    outFile.end();
    proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: 'Saved data to '.concat(filename) });
  }
};
