const request = require('request');
const fs = require('fs');
const path = require('path');
const pluginName = 'SWGTLogger';

module.exports = {
  defaultConfig: {
    enabled: true,
    saveToFile: false,
    sendCharacterJSON: true,
    importMonsters: true,
    apiKey: '',
    siteURL: ''
  },
  defaultConfigDetails: {
    saveToFile: {label: 'Save to file as well?'},
    sendCharacterJSON: {label: 'Send Character JSON?'},
    importMonsters: {label: 'Import Monsters?'},
    apiKey: { label: 'SWGT API key (On your SWGT profile page)', type: 'input' },
    siteURL: { label: 'SWGT API URL  (On your SWGT profile page)', type: 'input' }
  },
  pluginName,
  pluginDescription: 'For SWGT Patreon subscribers to automatically '+
    'upload various Summoners War data. Enable Character JSON to automatically update '+
    'your guild\'s members and your player\'s units/runes/artifacts',
  init(proxy, config) {
    cache={};

    var listenToCommands = [
      //Character JSON and Guild Member List
      'HubUserLogin',

      //Guild Info
      'getGuildAttendInfo',
      'GetGuildInfo',

      //Guild War
      'GetGuildWarBattleLogByGuildId',
      'GetGuildWarBattleLogByWizardId',
      'GetGuildWarMatchLog',
      'GetGuildWarRanking',

      //Siege
      'GetGuildSiegeBattleLogByWizardId',
      'GetGuildSiegeBattleLog',
      'GetGuildSiegeMatchupInfo',
      'GetGuildSiegeBaseDefenseUnitList',
      'GetGuildSiegeBaseDefenseUnitListPreset',
      'GetGuildSiegeRankingInfo'

      //Labyrinth
      //'GetGuildMazeContributeList',
      //'GetGuildMazeMemberInfoList'
    ];

    for(var commandIndex in listenToCommands){
      var command = listenToCommands[commandIndex];
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Binding to command: "+command });
        proxy.on(command, (req, resp) => {
          this.processRequest(command,proxy,config,req,resp,cache);
        });
    }
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
  processRequest(command, proxy, config, req, resp, cache) {
    if(command == "HubUserLogin")
      if (!config.Config.Plugins[pluginName].sendCharacterJSON) return;
      
    //Clean HubUserLogin resp
    if(resp['command'] == 'HubUserLogin'){
      var requiredHubUserLoginElements = [
        'command',
        'wizard_info',
        'guild',
        'unit_list',
        'runes',
        'artifacts',
        'tvalue'
      ];

      //Purge all unused variables
      pruned = {}
      for (var i in requiredHubUserLoginElements) {
        //Deep copy so we can modify
        pruned[requiredHubUserLoginElements[i]] = JSON.parse(JSON.stringify(resp[requiredHubUserLoginElements[i]]))
      }
      //Move runes/artifact from monsters to inventory (and detach from monster id)
      for (var mon in pruned.unit_list) {
        for (var rune in pruned.unit_list[mon].runes) {
          pruned.unit_list[mon].runes[rune].occupied_id = 0;
          pruned.runes.push(pruned.unit_list[mon].runes[rune])
          delete pruned.unit_list[mon].runes[rune];
        }
        for (var artifact in pruned.unit_list[mon].artifacts) {
          pruned.unit_list[mon].artifacts[artifact].occupied_id = 0;
          pruned.artifacts.push(pruned.unit_list[mon].artifacts[artifact])
          delete pruned.unit_list[mon].artifacts[artifact];
        }
      }
      //If import monsters is false, remove all monsters
      if(!config.Config.Plugins[pluginName].importMonsters)
        delete pruned['unit_list'];

      resp = pruned
    }

    this.writeToFile(proxy, req, resp);
    if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
    this.uploadToWebService(proxy, config, req, resp);
  },
  hasCacheMatch(proxy, config, req, resp, cache) {
    if (!this.hasAPISettings(config)) return false;

    var action = resp['command'];
    if ('log_type' in resp) {action += '_' + resp['log_type']};
    if ('ts_val' in resp) {delete resp['ts_val']};
    
    if(
      resp['command'] != 'HubUserLogin' && 
      resp['command'] != 'VisitFriend' && 
      resp['command'] != 'GetGuildWarRanking' && 
      resp['command'] != 'GetGuildSiegeRankingInfo'
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