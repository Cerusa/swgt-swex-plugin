const request = require('request');
const fs = require('fs');
const path = require('path');

const version = '2.0.1';
const pluginName = 'SWGTLogger';
var wizardBattles = [];
const siegeGuildRanking = new Map();
const worldGuildBattleGuildRanking = new Map();
var sendBattles = [];
var tempDefenseDeckInfo = [];
var observerDefenseInfo = [];
var observerAttackerList = [];
var localAPIkey = '';
var apiReference = {
  messageType: 'OK',
  enabledGuilds: [],
  enabledWizards: []//TODO:Limit entries based on return guild---will need wizardID-Guild Map
};
var monsterIDMap = {};
module.exports = {
  pluginName,
  version,
  autoUpdate: {
    versionURL: 'https://swgt.io/staticContent/SWGTLogger.yml'
  },
  pluginDescription: 'For SWGT Patreon subscribers to automatically ' +
    'upload various Summoners War data. Enable Character JSON to automatically update ' +
    'your guild\'s members and your player\'s units/runes/artifacts. ' +
    'Enable battle uploading to automatically log defenses and counters.',
  defaultConfig: {
    enabled: true,
    saveToFile: false,
    sendCharacterJSON: true,
    importMonsters: true,
    uploadBattles: false,
    apiKey: '',
    siteURL: ''
  },
  defaultConfigDetails: {
    saveToFile: { label: 'Save to file as well?' },
    sendCharacterJSON: { label: 'Send Character JSON?' },
    importMonsters: { label: 'Import monsters?' },
    uploadBattles: { label: '3MDC upload defense and counter as you battle?' },
    apiKey: { label: 'SWGT API key (On your SWGT profile page)', type: 'input' },
    siteURL: { label: 'SWGT API URL  (On your SWGT profile page)', type: 'input' }
  },
  init(proxy, config) {
    cache = {};
    cacheDuration = {};
    cacheTimerSettings = [
      { command: 'GetGuildInfo', timer: 60000 },
      { command: 'GetGuildWarRanking', timer: 300000 },
      { command: 'GetGuildWarMatchLog', timer: 60000 },
      { command: 'GetGuildSiegeMatchupInfo', timer: 60000 },
      { command: 'GetGuildSiegeRankingInfo', timer: 300000 },
      { command: 'GetGuildMazeStatusInfo', timer: 300000 },
      { command: 'getGuildBossBattleInfo', timer: 300000 }
    ];

    var listenToSWGTCommands = [
      //Character JSON and Guild Member List
      'HubUserLogin',

      //Guild Info
      'getGuildAttendInfo',
      'GetGuildInfo',
      'GetGuildInfoByName',
      'GetGuildInfoForChat',
      'GetGuildDataAll',

      //Siege
      'GetGuildSiegeBattleLogByWizardId',
      'GetGuildSiegeBattleLog',
      'GetGuildSiegeMatchupInfo',
      'GetGuildSiegeMatchupInfoForFinished',
      'GetGuildSiegeBaseDefenseUnitList',
      'GetGuildSiegeBaseDefenseUnitListPreset',
      'GetGuildSiegeRankingInfo',

      //Labyrinth
      'GetGuildMazeStatusInfo',
      'GetGuildMazeRankingList',
      'GetGuildMazeRanking',
      'GetGuildMazeContributeList',
      'GetGuildMazeBattleLogByWizard',
      'GetGuildMazeBattleLogByTile',

      //World Guild Battle (Server Guild War)
      'GetServerGuildWarBattleLogByGuild',
      'GetServerGuildWarMatchLog',
      'GetServerGuildWarMatchInfo',
      'GetServerGuildWarRanking',
      'GetServerGuildWarBattleLogByWizard',
      'GetServerGuildWarDefenseDeckList',
      'GetServerGuildWarBaseDeckList',
      'GetServerGuildWarParticipationInfo',//rating_id
      //'GetServerGuildWarBaseInfoListForOppView',
      //'GetServerGuildWarContributeList',

      //Monster Subjugation
      'getGuildBossBattleInfo',
      'getGuildBossBattleLogByWizard',
      'getGuildBossContributeList',
      'getGuildBossRankingList'
    ];

    var listenTo3MDCCommands = [
      //World Guild Battle (Server Guild War)
      'GetServerGuildWarMatchInfo',
      'GetServerGuildWarBaseDeckList',
      'BattleServerGuildWarStart',
      'BattleServerGuildWarRoundResult',
      'BattleServerGuildWarResult',
      'BattleServerGuildWarStartVirtual',
      'BattleServerGuildWarResultVirtual',

      //Siege
      'BattleGuildSiegeStart_v2',
      'BattleGuildSiegeResult',
      'GetGuildSiegeMatchupInfo',

      //SiegeTest
      'GetGuildSiegeRankingInfo',//rating_id
      'SetGuildSiegeBattleReplayData',

      //WorldGuildBattleTest
      'GetServerGuildWarParticipationInfo',//rating_id
      'SetServerGuildWarBattleReplayData',

      //AttackViewerInstance
      'GetGuildSiegeBaseDefenseUnitList',
      'GetGuildSiegeAttackUnitListInBattle',
      'GetGuildSiegeBattleLog'
    ];

    var listenToSWGTHistoryCommands = [
      //Siege Defense Units
      'GetGuildSiegeBaseDefenseUnitList',
      'GetGuildSiegeBaseDefenseUnitListPreset',
      'GetGuildSiegeDefenseDeckByWizardId',

      //Defense Log Link
      'GetGuildSiegeBattleLogByDeckId'
    ];


    proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Listening to commands: " + listenToSWGTCommands.toString().replace(/,/g, ', ') + '<br><br>' + listenTo3MDCCommands.toString().replace(/,/g, ', ') });
    //Attach SWGT events
    for (var commandIndex in listenToSWGTCommands) {
      var command = listenToSWGTCommands[commandIndex];
      proxy.on(command, (req, resp) => {
        var gRespCopy = JSON.parse(JSON.stringify(resp)); //Deep copy
        gRespCopy.swgtGuildPluginVersion = version;
        this.processRequest(command, proxy, config, req, gRespCopy, cache);
      });
    }
    //Attach 3MDC events if enabled
    if (config.Config.Plugins[pluginName].uploadBattles) {
      for (var commandIndex in listenTo3MDCCommands) {
        var command = listenTo3MDCCommands[commandIndex];
        proxy.on(command, (req, resp) => {
          var gRespCopy = JSON.parse(JSON.stringify(resp)); //Deep copy
          gRespCopy.swgtGuildPluginVersion = version;
          this.process3MDCRequest(command, proxy, config, req, gRespCopy, cache);
        });
      }
    }

    //Attach SWGT Siege Log History Data
    if (config.Config.Plugins[pluginName].enabled) {
      for (var commandIndex in listenToSWGTHistoryCommands) {
        var command = listenToSWGTHistoryCommands[commandIndex];
        proxy.on(command, (req, resp) => {
          var gRespCopy = JSON.parse(JSON.stringify(resp)); //Deep copy
          gRespCopy.swgtGuildPluginVersion = version;
          this.processSWGTHistoryRequest(command, proxy, config, req, gRespCopy, cache);
        });
      }
    }

    //Confirm SWGT plugin version and Site API Settings
    this.checkVersion(proxy);
    this.checkSiteAPI(proxy, config);
  },

  hasAPIEnabled(config, proxy) {
    if (!config.Config.Plugins[pluginName].enabled) return false;

    if (!config.Config.Plugins[pluginName].apiKey) {
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Missing API key.' });
      return false;
    }
    return true;
  },

  hasAPISettings(config, proxy) {
    if (localAPIkey != config.Config.Plugins[pluginName].apiKey) {
      this.checkSiteAPI(proxy, config);
      localAPIkey = config.Config.Plugins[pluginName].apiKey;
    }
    if (apiReference.messageType === 'OK') {
      //proxy.log({ type: 'DEBUG', source: 'plugin', name: this.pluginName, message: 'API Key Good' });
      return true;
    }
    if (apiReference.messageType === 'Warning') {
      proxy.log({ type: 'warning', source: 'plugin', name: this.pluginName, message: 'API Key near expiration' });
      return true;
    }
    if (apiReference.messageType === 'Error') {
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'API Key Incorrect or Expired.' });
      return false;
    }
    return false;
  },
  processRequest(command, proxy, config, req, resp, cache) {
    //if (command == "HubUserLogin")
    //  if (!config.Config.Plugins[pluginName].sendCharacterJSON) return;

    
    if(resp['command'] == 'GetServerGuildWarParticipationInfo'){
      try{
        worldGuildBattleGuildRanking.set(resp.ranking_info.guild_id,resp.ranking_info.rating_id);
      }catch(e){
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
      return;
    }

    //Clean HubUserLogin resp
    if (resp['command'] == 'HubUserLogin') {
      var requiredHubUserLoginElements = [
        'command',
        'wizard_info',
        'guild',
        'unit_list',
        'runes',
        'artifacts',
        'deco_list',
        'wizard_skill_list',
        'tvalue',
        'tzone',
        'unit_storage_normal_list',
        'unit_collection'
      ];
      var wizardInfoRequiredElements = [
        'wizard_id',
        'wizard_name'
      ];
      var guildRequiredElements = [
        'guild_info',
        'guild_members'
      ];
      var guildInfoRequiredElements = [
        'guild_id',
        'name'
      ];
      var unitListRequiredElements = [
        'unit_id',
        'wizard_id',
        'unit_master_id',
        'unit_level',
        'class',
        'runes',
        'artifacts',
        'create_time',
        'homunculus',
        'homunculus_name',
        'skills'
      ];
      var decoListRequiredElements = [
        'wizard_id',
        'deco_id',
        'master_id',
        'level'
      ];

      wizardid = resp['wizard_info']['wizard_id'];
      //Map wizardMonsters to wizard battles for server guild war
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == wizardid) {
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
            wizardBattles[k].monsterIDMap = {};
            proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `HubUserLogin:Wizard Found-${wizardFound}-WB:${wizardBattles[k].wizard_id}-Resp:${resp['wizard_info']['wizard_id']}` });
            for (var mon in resp.unit_list) {
              wizardBattles[k].monsterIDMap[resp.unit_list[mon].unit_id] = resp.unit_list[mon].unit_master_id;
            }

          }
        }
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `HubUserLogin:Wizard Found-${wizardFound}-${resp['wizard_info']['wizard_id']}` });
        if (!wizardFound) {
          wizardInfo.wizard_id = resp['wizard_info']['wizard_id'];
          wizardInfo.monsterIDMap = {};
          for (var mon in resp.unit_list) {
            wizardInfo.monsterIDMap[resp.unit_list[mon].unit_id] = resp.unit_list[mon].unit_master_id;
            wizardInfo.sendBattles = [];
          }
          wizardBattles.push(wizardInfo);
        }
        sendResp = wizardBattles;
        this.writeToFile(proxy, req, sendResp, '3MDCMonsterMap-');
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Map Monsters ${resp['command']}` });
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-Failed Monster Mapping-${e.message}` });
      }
      //Purge all unused variables
      var i = apiReference.enabledGuilds.length;
      while (i--) {
        if ('guild' in req) {
          if (apiReference.enabledGuilds[i] === resp.guild.guild_info.guild_id) {
            if (!(wizardid in apiReference.enabledWizards)) {
              apiReference.enabledWizards.push(wizardid)
            }
          }
        }
      }
      pruned = {}
      for (var i in requiredHubUserLoginElements) {
        //Deep copy so we can modify
        try {
          pruned[requiredHubUserLoginElements[i]] = JSON.parse(JSON.stringify(resp[requiredHubUserLoginElements[i]]));
        } catch (error) { }
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
      if (!config.Config.Plugins[pluginName].importMonsters)
        delete pruned['unit_list'];

      resp = pruned
    }

    //update siege battle map packet
    if (resp['command'] == 'GetGuildSiegeMatchupInfo') {
      try {
        //wizard id from request---guild id in member list---guild id
        wizardid = req['wizard_id'];
        packetInfo = {};
        packetInfo.guilds = [];

        blueGuildID = 0;
        bluePosID = 0;
        for (var wizard in resp.wizard_info_list) {
          if (wizardid == resp.wizard_info_list[wizard].wizard_id) {
            blueGuildID = resp.wizard_info_list[wizard].guild_id;
            //apply enabled guild to wizard id if blueGuildID in apiReference.EnabledGuilds
            var i = apiReference.enabledGuilds.length;
            while (i--) {
              if (apiReference.enabledGuilds[i] === blueGuildID) {
                if (!(wizardid in apiReference.enabledWizards)) {
                  apiReference.enabledWizards.push(wizardid)
                }
              }
            }
          }
        }

        yellowPosID = 0;
        redPosID = 0;
        for (var guild in resp.guild_list) {
          if (blueGuildID == resp.guild_list[guild].guild_id) {
            bluePosID = resp.guild_list[guild].pos_id;
            if (bluePosID == 1) {
              yellowPosID = 2;
              redPosID = 3;
            }
            if (bluePosID == 2) {
              yellowPosID = 3;
              redPosID = 1;
            }
            if (bluePosID == 3) {
              yellowPosID = 1;
              redPosID = 2;
            }
          }
        }
        for (var guild in resp.guild_list) {
          guildInfo = {}
          guildInfo.guild_id = resp.guild_list[guild].guild_id;
          guildInfo.pos_id = resp.guild_list[guild].pos_id;
          if (bluePosID == guildInfo.pos_id)
            guildInfo.color = "blue";
          if (yellowPosID == guildInfo.pos_id)
            guildInfo.color = "yellow";
          if (redPosID == guildInfo.pos_id)
            guildInfo.color = "red";
          towerInfo = [];
          for (var base in resp.base_list) {
            if (resp.base_list[base].guild_id == resp.guild_list[guild].guild_id && resp.base_list[base].base_type > 1) {
              towerInfo.push(resp.base_list[base].base_number);
            }
          }
          guildInfo.towers = towerInfo;
          packetInfo.guilds.push(guildInfo);
        }
        packetInfo.command = "SiegeBaseColors";
        packetInfo.siege_id = resp.match_info.siege_id;
        packetInfo.match_id = resp.match_info.match_id;
        packetInfo.guild_id = blueGuildID;
        packetInfo.date_time_stamp = resp.tvalue;

        resp2 = packetInfo;
        this.writeToFile(proxy, req, resp2, 'SWGT');
        if (this.hasCacheMatch(proxy, config, req, resp2, cache)) return;
        this.uploadToWebService(proxy, config, req, resp2, 'SWGT');
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp2['command']}-${e.message}` });
      }
    }

    if (resp['command'] == 'GetGuildInfo') {
      wizardid = req['wizard_id'];
      var i = apiReference.enabledGuilds.length;
      while (i--) {
        if('guild' in resp){
          if (apiReference.enabledGuilds[i] === resp.guild.guild_info.guild_id) {
            if (!(wizardid in apiReference.enabledWizards)) {
              apiReference.enabledWizards.push(wizardid)
            }
          }
        }
      }
    }
    if (resp['command'] == 'GetServerGuildWarMatchInfo') {
      wizardid = req['wizard_id'];
      var i = apiReference.enabledGuilds.length;
      while (i--) {
        if (apiReference.enabledGuilds[i] === resp.server_guildwar_match_info.guild_id) {
          if (!(wizardid in apiReference.enabledWizards)) {
            apiReference.enabledWizards.push(wizardid)
          }
        }
      }
    }

    //Clean GetServerGuildWarDefenseDeckList resp
    if(resp['command'] == 'GetServerGuildWarDefenseDeckList'){
      try{
        for(var root_element_name in resp){
          if(root_element_name == "deck_list"){
            var deck_list = resp[root_element_name];
            for (var deck_list_index in deck_list) {
              var deck_list_child_element = deck_list[deck_list_index];
              
              delete deck_list_child_element.total_win_count;
              delete deck_list_child_element.total_draw_count;
              delete deck_list_child_element.total_lose_count;
        
              delete deck_list_child_element.win_count;
              delete deck_list_child_element.draw_count;
              delete deck_list_child_element.lose_count;
            }
          }
          if(root_element_name == "round_unit_list"){
            var round_unit_list = resp[root_element_name];
            
            for(var round_unit_list_index in round_unit_list){
              var round_unit_list_child_element = round_unit_list[round_unit_list_index];
              
              for(var round_unit_list_child_element_index in round_unit_list_child_element){
                var round_unit_list_child_element_element = round_unit_list_child_element[round_unit_list_child_element_index];
                
                delete round_unit_list_child_element_element.unit_info.accuracy;
                delete round_unit_list_child_element_element.unit_info.artifacts;
                delete round_unit_list_child_element_element.unit_info.atk;
                delete round_unit_list_child_element_element.unit_info.attribute;
                delete round_unit_list_child_element_element.unit_info.awakening_info;
                delete round_unit_list_child_element_element.unit_info.building_id;
                delete round_unit_list_child_element_element.unit_info.class;
                delete round_unit_list_child_element_element.unit_info.con;
                delete round_unit_list_child_element_element.unit_info.costume_master_id;
                delete round_unit_list_child_element_element.unit_info.create_time;
                delete round_unit_list_child_element_element.unit_info.critical_damage;
                delete round_unit_list_child_element_element.unit_info.critical_rate;
                delete round_unit_list_child_element_element.unit_info.def;
                delete round_unit_list_child_element_element.unit_info.exp_gain_rate;
                delete round_unit_list_child_element_element.unit_info.exp_gained;
                delete round_unit_list_child_element_element.unit_info.experience;
                delete round_unit_list_child_element_element.unit_info.homunculus;
                delete round_unit_list_child_element_element.unit_info.homunculus_name;
                delete round_unit_list_child_element_element.unit_info.island_id;
                delete round_unit_list_child_element_element.unit_info.pos_x;
                delete round_unit_list_child_element_element.unit_info.pos_y;
                delete round_unit_list_child_element_element.unit_info.resist;
                delete round_unit_list_child_element_element.unit_info.runes;
                delete round_unit_list_child_element_element.unit_info.skills;
                delete round_unit_list_child_element_element.unit_info.source;
                delete round_unit_list_child_element_element.unit_info.spd;
                delete round_unit_list_child_element_element.unit_info.trans_items;
                delete round_unit_list_child_element_element.unit_info.unit_index;
                delete round_unit_list_child_element_element.unit_info.unit_level;
              }
            }
          }
        }
      }catch(e){}
    }

    this.writeToFile(proxy, req, resp, 'SWGT');
    if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
    this.uploadToWebService(proxy, config, req, resp, 'SWGT');
  },
  process3MDCRequest(command, proxy, config, req, resp, cache) {
    if (!config.Config.Plugins[pluginName].uploadBattles) return false;
    
    if (resp['command'] == 'GetServerGuildWarMatchInfo') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            //update rating id
            wizardBattles[k].guild_rating_id = resp['server_guildwar_match_info']['match_rating_id'];
            wizardBattles[k].guild_id = resp['server_guildwar_match_info']['guild_id'];
            wizardBattles[k].guild_name = resp['server_guildwar_match_info']['guild_name'];
            wizardBattles[k].opp_guild_name = resp['opp_guild_match_info']['guild_name'];
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        if (!wizardFound) {
          wizardInfo.wizard_id = req['wizard_id'];
          wizardInfo.guild_name = resp['server_guildwar_match_info']['guild_name'];
          wizardInfo.guild_rating_id = resp['server_guildwar_match_info']['match_rating_id'];
          wizardInfo.guild_id = resp['server_guildwar_match_info']['guild_id'];
          wizardInfo.opp_guild_name = resp['opp_guild_match_info']['guild_name'];
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }

      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
      try{
        if(worldGuildBattleGuildRanking.has(resp.server_guildwar_match_info.guild_id) == false)
          worldGuildBattleGuildRanking.set(resp.server_guildwar_match_info.guild_id,resp.server_guildwar_match_info.match_rating_id);
      }catch(e){}
    }
    if (resp['command'] == 'GetGuildSiegeRankingInfo') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            //update rating id
            wizardBattles[k].siege_rating_id = resp['guildsiege_ranking_info']['rating_id'];
            wizardBattles[k].guild_id = resp['guildsiege_ranking_info']['guild_id'];
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        if (!wizardFound) {
          wizardInfo.wizard_id = req['wizard_id'];
          wizardInfo.siege_rating_id = resp['guildsiege_ranking_info']['rating_id'];
          wizardInfo.guild_id = resp['guildsiege_ranking_info']['guild_id'];
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
      try{
        siegeGuildRanking.set(resp.guildsiege_ranking_info.guild_id,resp.guildsiege_ranking_info.rating_id);
      }catch(e){}
    }
    
    if(resp['command'] == 'GetServerGuildWarParticipationInfo'){
      try{
        worldGuildBattleGuildRanking.set(resp.ranking_info.guild_id,resp.ranking_info.rating_id);
      }catch(e){
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
      return;
    }
    if (resp['command'] == 'GetGuildSiegeMatchupInfo') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardBattles[k].siege_rating_id = resp['match_info']['rating_id'];

            //clear attack and defense lists on new siege matchid for a specific wizard (to allow for multiple guilds being watched by the same plugin)
            if (wizardBattles[k].match_id != resp['match_info']['match_id']) {
              wizardBattles[k].observerDefenseInfo = [];
              wizardBattles[k].observerAttackerList = [];
            }
            wizardBattles[k].match_id = resp['match_info']['match_id'];
            for (var wizard in resp['wizard_info_list']) {
              if (resp['wizard_info_list'][wizard].wizard_id == req['wizard_id']) {
                wizardBattles[k].guild_id = resp['wizard_info_list'][wizard].guild_id;
                //TODO: add opponent guild id object to reference guild names												 
              }
            }

            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `GGSMI:Wizard Found-${wizardFound}` });
        if (!wizardFound) {
          wizardInfo.wizard_id = req['wizard_id'];
          wizardInfo.siege_rating_id = resp['match_info']['rating_id'];
          wizardInfo.match_id = resp['match_info']['match_id'];
          wizardInfo.observerDefenseInfo = [];
          wizardInfo.observerAttackerList = [];
          for (var wizard in resp['wizard_info_list']) {
            if (resp['wizard_info_list'][wizard].wizard_id == req['wizard_id']) {
              wizardInfo.guild_id = resp['wizard_info_list'][wizard].guild_id;
            }
          }
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }

        sendResp = wizardBattles;
        this.writeToFile(proxy, req, sendResp, 'WizardBattles-');
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }
    if (resp['command'] == 'BattleServerGuildWarStart' || resp['command'] == 'BattleServerGuildWarStartVirtual') {
      //Store only the information needed for transfer
      try {
        k = 0;
        //match up wizard id and push the battle
        for (var kindex = wizardBattles.length - 1; kindex >= 0; kindex--) {
          if (wizardBattles[kindex].wizard_id == req['wizard_id']) {
            //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Test Server GW Start-Found Index- ${resp['command']}` });
            k = kindex;
            kindex = -1;
          }
          //if (kindex == -1){break};
        }

        for (var i = 0; i < 5; i++) {
          battle = {}
          battle.command = "3MDCBattleLog";
          battle.battleType = "WorldGuildBattle";
          battle.wizard_id = resp.wizard_info.wizard_id;
          battle.wizard_name = resp.wizard_info.wizard_name;
          battle.battleKey = resp.battle_key;
          battle.battleIndex = i;
          battle.battleStartTime = resp.tvalue;
          battle.defense = {}
          battle.counter = {}
          battle.opp_guild_id = resp.target_base_info.guild_id;
          battle.opp_wizard_id = resp.target_base_info.wizard_id;
          battle.opp_wizard_name = resp.target_base_info.wizard_name;
          battle.battleRank = wizardBattles[k].guild_rating_id;
          battle.guild_id = wizardBattles[k].guild_id;
          battle.opp_guild_name = wizardBattles[k].opp_guild_name;
          battle.guild_name = wizardBattles[k].guild_name;

          //prepare the arrays
          units = [];
          battle.defense.units = [];
          battle.counter.units = [];
          battle.counter.unique = [];
          for (var j = 0; j < 3; j++) {
            try {
              //Offense Mons
              //battle.counter.units.push(resp.unit_id_list[i][j].unit_master_id);//need to map unit id from hubuserlogin
              battle.counter.unique.push(resp.unit_id_list[i][j]); //unique monster id ''
              //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp.unit_id_list[i][j]}-Counter List-${i}-${j}-${wizardBattles[k].monsterIDMap?.[resp.unit_id_list[i][j]]}` });
              if (wizardBattles[k].monsterIDMap?.[resp.unit_id_list[i][j]] !== undefined) {
                counterUnit = wizardBattles[k].monsterIDMap[resp.unit_id_list[i][j]];
              } else {
                counterUnit = -99999;
              }
              battle.counter.units.push(counterUnit);
              //Defense Mons
              iDefense = (i + 1).toString();
              battle.defense.units.push(resp.opp_unit_list[iDefense].unit_list[j].unit_info.unit_master_id);
            } catch (e) {
              //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-Counter Prep-${e.message}` });	
            }
          }

          wizardBattles[k].sendBattles.push(battle);
          //sendResp = battle;
          //this.writeToFile(proxy, req, sendResp,'3MDCServerGWStart-'+i);
          //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Test Server GW Start ${resp['command']}` });


        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }
    if (resp['command'] == 'BattleGuildSiegeStart_v2') {
      try {
        battle = {}
        battle.command = "3MDCBattleLog";
        battle.battleType = "Siege";
        battle.wizard_id = resp.wizard_info.wizard_id;
        battle.wizard_name = resp.wizard_info.wizard_name;
        battle.battleKey = resp.battle_key;
        battle.battleStartTime = resp.tvalue;
        battle.defense = {}
        battle.counter = {}
        //TODO: add opp guild id/guild name, opp_id and opp_name---from prebuilt objects on siegebasedefenseunitlist and matchupinfo
        //prepare the arrays
        units = [];
        battle.defense.units = [];
        battle.counter.units = [];
        battle.counter.unique = [];
        for (var j = 0; j < 3; j++) {
          try {
            //Defense Mons
            battle.defense.units.push(resp.guildsiege_opp_unit_list[j].unit_info.unit_master_id);
            //Offense Mons
            battle.counter.units.push(resp.guildsiege_my_unit_list[j].unit_master_id);
            battle.counter.unique.push(resp.guildsiege_my_unit_list[j].unit_id);

          } catch (e) { }
        }
        //match up wizard id and push the battle
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            //store battle in array
            battle.battleRank = wizardBattles[k].siege_rating_id;
            battle.guild_id = wizardBattles[k].guild_id;
            wizardBattles[k].sendBattles.push(battle);
          }
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }
    if (resp['command'] == 'BattleServerGuildWarRoundResult') {
      //store battle start time for second battle and end time for first battle
      var j = req['round_id'] - 1;
      try {//Handle out of order processing
        for (var wizard in wizardBattles) {
          //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle Round Wizard Search ${wizard}` });
          for (var k = wizardBattles[wizard].sendBattles.length - 1; k >= 0; k--) {
            if (wizardBattles[wizard].sendBattles[k].wizard_id == req['wizard_id']) {
              //if (j==1){wizardBattles[wizard].sendBattles[k].battleStartTime = resp.tvalue};
              if (j == k) {
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle Round ${j + 1} Saved` });
                wizardBattles[wizard].sendBattles[k].battleDateTime = resp.tvalue;

                //sendResp = wizardBattles[wizard].sendBattles[k];

                if (j < 4) { wizardBattles[wizard].sendBattles[k + 1].battleStartTime = resp.tvalue };

                //if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0 && sendResp.battleRank >= 1000) {
                //this.writeToFile(proxy, req, sendResp,'3MDCProgress-'+j);
                //}
              }
            }
          }
        }
        //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle Round End Test ${j}` });
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle Round End Error ${e.message}` });
      }
      if (j == 1) {
        j = 0;
      }
    }

    if (req['command'] == 'BattleGuildSiegeResult') {
      var j = 0;
      try {//Handle out of order processing
        for (var wizard in wizardBattles) {
          for (var k = wizardBattles[wizard].sendBattles.length - 1; k >= 0; k--) {
            //Handle multiple accounts with GW and Siege going at the same time. match battlekey and wizard. then do battles 1 and 2 and delete from the mon list.
            if (wizardBattles[wizard].sendBattles[k].battleKey == req['battle_key']) {
              wizardBattles[wizard].sendBattles[k].win_lose = req['win_lose'];
              wizardBattles[wizard].sendBattles[k].battleDateTime = resp.tvalue - j;
              if('server_id' in resp)
                wizardBattles[wizard].sendBattles[k].swex_server_id = resp['server_id'];
              j++;
              sendResp = wizardBattles[wizard].sendBattles[k];
              //remove battle from the sendBattlesList
              wizardBattles[wizard].sendBattles.splice(k, 1);
              //if 3 mons in offense and defense then send to webservice
              if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0 && sendResp.battleRank >= 4000) {
                this.writeToFile(proxy, req, sendResp, '3MDC-' + k);

                this.uploadToWebService(proxy, config, req, sendResp, '3MDC');
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Battle End Processed ${k}` });
              }
            }
          }
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Battle End Error ${e.message}` });
      }
      if (j == 1) {
        j = 0;
      }
    }
    if (req['command'] == 'BattleServerGuildWarResult' || resp['command'] == 'BattleServerGuildWarResultVirtual') {
      var j = 5;
      try {//Handle out of order processing
        for (var wizard in wizardBattles) {

          for (var k = wizardBattles[wizard].sendBattles.length - 1; k >= 0; k--) {
            //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle End Loop ${k} ${req['win_lose_list'][j]}` });
            if (wizardBattles[wizard].sendBattles[k].wizard_id == req['wizard_id']) {


              jstr = j.toString();
              wizardBattles[wizard].sendBattles[k].win_lose = req['win_lose_list'][jstr];
              wizardBattles[wizard].sendBattles[k].attacker_server_id = resp['attack_info']['server_id'];
              wizardBattles[wizard].sendBattles[k].opp_server_id = resp['target_base_info']['server_id'];
              if('server_id' in resp)
                wizardBattles[wizard].sendBattles[k].swex_server_id = resp['server_id'];
              if (j == 5) { wizardBattles[wizard].sendBattles[k].battleDateTime = resp.tvalue };
              j--;
              sendResp = wizardBattles[wizard].sendBattles[k];
              //remove battle from the sendBattlesList
              wizardBattles[wizard].sendBattles.splice(k, 1);
              //if result then add time and win/loss then send to webservice
              this.writeToFile(proxy, req, sendResp, '3MDC-' + k);
              if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0 && sendResp.battleRank >= 1000) {
                this.uploadToWebService(proxy, config, req, sendResp, '3MDC');
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle Round End Processed ${k + 1}` });
              }
            }
            //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle End Test ${k}` });
          }
        }
        //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle End Test 2` });

      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Server GW Battle End Error ${e.message}` });
      }
      if (j == 1) {
        j = 0;
      }
    }

    if (req['command'] == 'SetGuildSiegeBattleReplayData') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req.battle_info.wizard_id) {
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        if (!wizardFound) {
          wizardInfo.wizard_id = req.battle_info.wizard_id;
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
      try {
        if (req.battle_info.guild_id == req.battle_info.opp_guild_id) {
          battle = {}
          battle.command = "3MDCBattleLog";
          battle.battleType = "SiegeTest";
          battle.wizard_id = req.battle_info.wizard_id;
          battle.wizard_name = req.battle_info.wizard_name;
          battle.battleKey = req.battle_key;
          battle.guild_id = req.battle_info.guild_id;
          battle.guild_name = req.battle_info.guild_name;
          battle.opp_wizard_id = req.battle_info.opp_wizard_id;
          battle.opp_wizard_name = req.battle_info.opp_wizard_name;
          battle.battleRank = siegeGuildRanking.get(battle.guild_id);
          battle.defense = {}
          battle.counter = {}

          battle.battleDateTime = resp.tvalue;
          if('server_id' in resp)
            battle.swex_server_id = resp['server_id'];
          battle.win_lose = req.battle_info.result_list[0];

          //prepare the arrays
          battle.defense.units = [];
          battle.counter.units = [];
          
          //Defense Mons
          for (var j = 0; j < 3; j++) {
            try {
              battle.defense.units.push(req.battle_info.opp_unit_list[0][j]);
            } catch (e) { }
          }

          //Offense Mons
          for (var j = 0; j < 3; j++) {
            try {
                battle.counter.units.push(req.battle_info.unit_list[0][j]);
            } catch (e) { }
          }
          //if 3 mons in defense and at least one counter and rank is G1+ then send to webservice
          if (battle.defense.units.length == 3 && battle.counter.units.length > 0 && battle.battleRank >= 4000) {
            this.writeToFile(proxy, req, battle, '3MDC-SiegeTest-');
            this.uploadToWebService(proxy, config, req, battle, '3MDC');
            proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Test Battle Processed` });
          }
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }

    if (req['command'] == 'SetServerGuildWarBattleReplayData') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req.battle_info.wizard_id) {
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        if (!wizardFound) {
          wizardInfo.wizard_id = req.battle_info.wizard_id;
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
      try {
        if (req.battle_info.guild_id == req.battle_info.opp_guild_id) {
          battle = {}
          battle.command = "3MDCBattleLog";
          battle.battleType = "WorldGuildBattleTest";
          battle.wizard_id = req.battle_info.wizard_id;
          battle.wizard_name = req.battle_info.wizard_name;
          battle.battleKey = req.battle_key;
          battle.guild_id = req.battle_info.guild_id;
          battle.guild_name = req.battle_info.guild_name;
          battle.attacker_server_id = req.battle_info.server_type;
          battle.opp_wizard_id = req.battle_info.opp_wizard_id;
          battle.opp_wizard_name = req.battle_info.opp_wizard_name;
          battle.opp_guild_id = req.battle_info.opp_guild_id;
          battle.opp_guild_name = req.battle_info.opp_guild_name;
          battle.opp_server_id = req.battle_info.opp_server_type;
          battle.battleRank = worldGuildBattleGuildRanking.get(battle.guild_id);
          battle.defense = {}
          battle.counter = {}

          battle.battleDateTime = resp.tvalue;
          if('server_id' in resp)
            battle.swex_server_id = resp['server_id'];
          battle.win_lose = req.battle_info.result_list[0];

          //prepare the arrays
          battle.defense.units = [];
          battle.counter.units = [];
          
          //Defense Mons
          for (var j = 0; j < 3; j++) {
            try {
              battle.defense.units.push(req.battle_info.opp_unit_list[0][j]);
            } catch (e) { }
          }

          //Offense Mons
          for (var j = 0; j < 3; j++) {
            try {
                battle.counter.units.push(req.battle_info.unit_list[0][j]);
            } catch (e) { }
          }
          //if 3 mons in defense and at least one counter and rank is G1+ then send to webservice
          if (battle.defense.units.length == 3 && battle.counter.units.length > 0 && battle.battleRank >= 4000) {
            this.writeToFile(proxy, req, battle, '3MDC-WGBTest-');
            this.uploadToWebService(proxy, config, req, battle, '3MDC');
            proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `WGB Test Battle Processed` });
          }
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }

    //Perform the observer role to create a battle log
    //Step 1 - Create a list of defense units for the base selected
    //Step 2 - Add an attacking unit to an attacker array for that base and defense
    //Step 3 - View the battle log and match up based on the time of entry and the time of battle log, once matched send the resulting wizardBattle
    //Populate the Defense_Deck Table
    if (resp['command'] == 'GetGuildSiegeBaseDefenseUnitList') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        var wizardIndex = 0; //match wizardID
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardIndex = k;
          }
        }
        defenseInfo = {}
        tempDefenseDeckInfo = [];
        sendDecks = {}


        for (var deck in resp['defense_deck_list']) {
          defenseInfo = {};
          defenseFound = false;
          defenseInfo.wizard_id = resp['defense_deck_list'][deck].wizard_id;
          defenseInfo.deck_id = resp['defense_deck_list'][deck].deck_id;
          defenseInfo.base_id = req.base_number;
          unitCount = 0;
          for (var defenseUnit in resp['defense_unit_list']) {
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 1 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon1 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon1 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 2 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 3 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount++;
            }
          }
          //sort mon2 and mon3
          if (unitCount == 3) {
            if (defenseInfo.mon3 < defenseInfo.mon2) {
              tempMon = defenseInfo.uniqueMon2;
              tempMon2 = defenseInfo.mon2;
              defenseInfo.uniqueMon2 = defenseInfo.uniqueMon3;
              defenseInfo.mon2 = defenseInfo.mon3;
              defenseInfo.uniqueMon3 = tempMon;
              defenseInfo.mon3 = tempMon2;

            }
            defenseInfo.deckPrimaryKey = defenseInfo.wizard_id.toString() + "_" + defenseInfo.uniqueMon1.toString() + "_" + defenseInfo.uniqueMon2.toString() + "_" + defenseInfo.uniqueMon3.toString();
            //add attackunit and latest battlestarttime to the defenseInfo
            for (var defenseUnitStatus in resp['defense_deck_status_list']) {
              if (defenseInfo.deck_id == resp['defense_deck_status_list'][defenseUnitStatus].deck_id) {
                defenseInfo.attack_wizard_id = resp['defense_deck_status_list'][defenseUnitStatus].attack_wizard_id;
                defenseInfo.battle_start_time = resp['defense_deck_status_list'][defenseUnitStatus].battle_start_time;
              }
            }
            //check if defense exists first
            for (var k = wizardBattles[wizardIndex].observerDefenseInfo.length - 1; k >= 0; k--) {
              if (wizardBattles[wizardIndex].observerDefenseInfo[k].deck_id == defenseInfo.deck_id &&
                wizardBattles[wizardIndex].observerDefenseInfo[k].attack_wizard_id == defenseInfo.attack_wizard_id &&
                wizardBattles[wizardIndex].observerDefenseInfo[k].battle_start_time == defenseInfo.battle_start_time) {
                //observerDefenseInfo.push(defenseInfo) 
                defenseFound = true;
              }
            }
            if (defenseFound == false) {
              wizardBattles[wizardIndex].observerDefenseInfo.push(defenseInfo)
            }
          }
        }
        sendDecks.command = "SWGTSiegeObserverDefense";
        sendDecks.deck_units = wizardBattles[wizardIndex].observerDefenseInfo;
        sendResp = sendDecks;
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }

    //Step 2
    if (resp['command'] == 'GetGuildSiegeAttackUnitListInBattle') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        var wizardIndex = 0; //match wizardID
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardIndex = k;
          }
        }
        attackInfo = {}
        tempDefenseDeckInfo = [];
        sendDecks = {}


        for (var deck in resp['guildsiege_attack_unit_list']) {
          attackInfo = {};
          attackFound = false;
          attackInfo.attack_wizard_id = resp['guildsiege_attack_unit_list'][deck].wizard_id;
          attackInfo.attack_wizard_name = resp['wizard_info_list'][0].wizard_name;
          attackInfo.deck_id = req.deck_id;
          attackInfo.base_id = req.base_number;
          unitCount = 0;
          for (var attackUnit in resp['guildsiege_attack_unit_list'][deck].unit_list) {

            if (resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].pos_id == 1) {
              attackInfo.uniqueMon1 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_id;
              attackInfo.mon1 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_master_id;
              unitCount++;

            }
            if (resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].pos_id == 2) {
              attackInfo.uniqueMon2 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_id;
              attackInfo.mon2 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_master_id;
              unitCount++;
            }
            if (resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].pos_id == 3) {
              attackInfo.uniqueMon3 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_id;
              attackInfo.mon3 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_master_id;
              unitCount++;
            }
          }
          //sort mon2 and mon3
          if (unitCount == 3) {
            if (attackInfo.mon3 < attackInfo.mon2) {
              tempMon = attackInfo.uniqueMon2;
              tempMon2 = attackInfo.mon2;
              attackInfo.uniqueMon2 = attackInfo.uniqueMon3;
              attackInfo.mon2 = attackInfo.mon3;
              attackInfo.uniqueMon3 = tempMon;
              attackInfo.mon3 = tempMon2;

            }
            attackInfo.deckPrimaryKey = attackInfo.attack_wizard_id.toString() + "_" + attackInfo.uniqueMon1.toString() + "_" + attackInfo.uniqueMon2.toString() + "_" + attackInfo.uniqueMon3.toString();
            //add attackunit and latest battlestarttime to the attackInfo
            attackInfo.battle_start_time = resp.tvalue;

            //check if defense exists first
            for (var k = wizardBattles[wizardIndex].observerAttackerList.length - 1; k >= 0; k--) {
              if (wizardBattles[wizardIndex].observerAttackerList[k].deck_id == attackInfo.deck_id &&
                wizardBattles[wizardIndex].observerAttackerList[k].attack_wizard_id == attackInfo.attack_wizard_id &&
                wizardBattles[wizardIndex].observerAttackerList[k].deckPrimaryKey == attackInfo.deckPrimaryKey) {
                //observerDefenseInfo.push(defenseInfo) 
                attackFound = true;
              }
            }
            if (attackFound == false) {
              wizardBattles[wizardIndex].observerAttackerList.push(attackInfo)
            }
          }
        }
        sendDecks.command = "SWGTSiegeObserverAttack";
        sendDecks.deck_units = wizardBattles[wizardIndex].observerAttackerList;
        sendResp = sendDecks;
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }

    //Step 3--Review Attacker Battle log and remove defense//attack pairs....could be multiple attackers per one defense so clear all attacks before removing a defense from the list or just on defense loss.
    if (req['command'] == 'GetGuildSiegeBattleLog' && resp['log_type'] == 1) {
      try {
        var wizardIndex = 0; //match wizardID
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardIndex = k;
          }
        }
        for (var battle1 = resp['log_list'][0].battle_log_list.length - 1; battle1 >= 0; battle1--) {  //go through each recorded offense
          //first see if you can find a defense that matches by base number
          for (var k = wizardBattles[wizardIndex].observerDefenseInfo.length - 1; k >= 0; k--) {
            if (resp['log_list'][0].battle_log_list[battle1].base_number == wizardBattles[wizardIndex].observerDefenseInfo[k].base_id &&
              resp['log_list'][0].battle_log_list[battle1].opp_wizard_id == wizardBattles[wizardIndex].observerDefenseInfo[k].wizard_id) {
              //once a defense is found, search the attacker list to find any matches for this base, and attack log
              var defenseDefeated = false;
              for (var j = wizardBattles[wizardIndex].observerAttackerList.length - 1; j >= 0; j--) {

                if (resp['log_list'][0].battle_log_list[battle1].wizard_id == wizardBattles[wizardIndex].observerAttackerList[j].attack_wizard_id &&
                  wizardBattles[wizardIndex].observerAttackerList[j].deck_id == wizardBattles[wizardIndex].observerDefenseInfo[k].deck_id &&
                  wizardBattles[wizardIndex].observerDefenseInfo[k].battle_start_time < wizardBattles[wizardIndex].observerAttackerList[j].battle_start_time &&
                  wizardBattles[wizardIndex].observerAttackerList[j].battle_start_time < resp['log_list'][0].battle_log_list[battle1].log_timestamp) {
                  battle = {}
                  battle.command = "3MDCBattleLog";
                  battle.battleType = "SiegeObserver";
                  battle.wizard_id = wizardBattles[wizardIndex].observerAttackerList[j].attack_wizard_id;
                  battle.wizard_name = wizardBattles[wizardIndex].observerAttackerList[j].attack_wizard_name;
                  battle.defense = {}
                  battle.counter = {}

                  //prepare the arrays
                  units = [];
                  battle.defense.units = [];
                  battle.counter.units = [];
                  battle.counter.unique = [];
                  //for (var m = 0; m < 3; m++) {
                  try {


                    //Defense Mons
                    battle.defense.units.push(wizardBattles[wizardIndex].observerDefenseInfo[k].mon1);
                    battle.defense.units.push(wizardBattles[wizardIndex].observerDefenseInfo[k].mon2);
                    battle.defense.units.push(wizardBattles[wizardIndex].observerDefenseInfo[k].mon3);

                    //Offense Mons
                    battle.counter.units.push(wizardBattles[wizardIndex].observerAttackerList[j].mon1);
                    battle.counter.units.push(wizardBattles[wizardIndex].observerAttackerList[j].mon2);
                    battle.counter.units.push(wizardBattles[wizardIndex].observerAttackerList[j].mon3);

                    battle.counter.unique.push(wizardBattles[wizardIndex].observerAttackerList[j].uniqueMon1);
                    battle.counter.unique.push(wizardBattles[wizardIndex].observerAttackerList[j].uniqueMon2);
                    battle.counter.unique.push(wizardBattles[wizardIndex].observerAttackerList[j].uniqueMon3);
                  } catch (e) { }
                  //}
                  //match up wizard id for guild rank
                  for (var m = wizardBattles.length - 1; m >= 0; m--) {
                    if (wizardBattles[m].wizard_id == req['wizard_id']) {
                      //store battle in array
                      battle.battleRank = wizardBattles[m].siege_rating_id;
                      battle.guild_id = wizardBattles[m].guild_id;
                    }
                  }
                  //win/loss info and then send the battle and remove from the attack list
                  battle.win_lose = resp['log_list'][0].battle_log_list[battle1].win_lose;
                  if (battle.win_lose == 1) {
                    defenseDefeated = true;
                  }
                  battle.battleDateTime = resp['log_list'][0].battle_log_list[battle1].log_timestamp;
                  battle.battleKey = Number(battle.wizard_id.toString() + battle.battleDateTime.toString());
                  sendResp = battle;
                  if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0 && sendResp.battleRank >= 0) {
                    req['command'] = "SiegeObserverBattle";
                    this.writeToFile(console, req, sendResp, '3MDC-Obs3-' + j + '-' + k + '-');
                    this.uploadToWebService(proxy, config, req, sendResp, '3MDC');
                    proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Observer End Processed ${wizardBattles[wizardIndex].observerAttackerList[j].attack_wizard_name}` });
                  }
                  wizardBattles[wizardIndex].observerAttackerList.splice(j, 1);
                }
              } //end attacker loop check
              //if one of the attackers defeated the defense then remove this defense from the observerdefense array
              if (defenseDefeated) {
                wizardBattles[wizardIndex].observerDefenseInfo.splice(k, 1);
              }
            } //end defense if statement
          } //end defense loop
        }//end loop through battle log attacks
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Battle End Error ${e.message}` });
      }
    }

  },

  processSWGTHistoryRequest(command, proxy, config, req, resp, cache) {
    //Populate the Defense_Deck Table
    if (resp['command'] == 'GetGuildSiegeBaseDefenseUnitList' || resp['command'] == 'GetGuildSiegeBaseDefenseUnitListPreset' || resp['command'] == 'GetGuildSiegeDefenseDeckByWizardId') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        defenseInfo = {}
        tempDefenseDeckInfo = [];
        sendDecks = {}
        defenseFound = false;

        for (var deck in resp['defense_deck_list']) {
          defenseInfo = {};
          defenseInfo.wizard_id = resp['defense_deck_list'][deck].wizard_id;
          defenseInfo.deck_id = resp['defense_deck_list'][deck].deck_id;
          unitCount = 0;
          for (var defenseUnit in resp['defense_unit_list']) {
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 1 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon1 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon1 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 2 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 3 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount++;
            }
          }
          //sort mon2 and mon3
          if (unitCount == 3) {
            if (defenseInfo.mon3 < defenseInfo.mon2) {
              tempMon = defenseInfo.uniqueMon2;
              tempMon2 = defenseInfo.mon2;
              defenseInfo.uniqueMon2 = defenseInfo.uniqueMon3;
              defenseInfo.mon2 = defenseInfo.mon3;
              defenseInfo.uniqueMon3 = tempMon;
              defenseInfo.mon3 = tempMon2;

            }
            defenseInfo.deckPrimaryKey = defenseInfo.wizard_id.toString() + "_" + defenseInfo.uniqueMon1.toString() + "_" + defenseInfo.uniqueMon2.toString() + "_" + defenseInfo.uniqueMon3.toString();

            tempDefenseDeckInfo.push(defenseInfo)
          }
        }
        sendDecks.command = "SWGTSiegeDeckUnits";
        sendDecks.deck_units = tempDefenseDeckInfo;
        sendResp = sendDecks;
        this.writeToFile(proxy, req, sendResp, 'SWGT2-');
        if (this.hasCacheMatch(proxy, config, req, sendResp, cache)) return;
        this.uploadToWebService(proxy, config, req, sendResp, 'SWGT');
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }

    //Populate the Defense_Deck Log Matching Table

    if (resp['command'] == 'GetGuildSiegeBattleLogByDeckId') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it

      try {
        targetdeckid = req['target_deck_id'];
        sendDecks = {}
        deckLogLink = []
        deckwizardID = 0;

        //find the deckid info that matches in the tempDefenseDeckInfo
        for (var k = tempDefenseDeckInfo.length - 1; k >= 0; k--) {
          if (tempDefenseDeckInfo[k].deck_id == req['target_deck_id']) {
            deckIDPrimaryKey = tempDefenseDeckInfo[k].wizard_id.toString() + "_" + tempDefenseDeckInfo[k].uniqueMon1.toString() + "_" + tempDefenseDeckInfo[k].uniqueMon2.toString() + "_" + tempDefenseDeckInfo[k].uniqueMon3.toString();
            deckwizardID = tempDefenseDeckInfo[k].wizard_id;
          }
        }
        for (var siegewar in resp['log_list']) {
          for (var battleLog in resp['log_list'][siegewar].battle_log_list) {
            //add each battle to deckLogLink
            if (deckwizardID == resp['log_list'][siegewar].battle_log_list[battleLog].wizard_id) {
              deckLogValues = {}
              deckLogValues.deckIDPrimaryKey = deckIDPrimaryKey;
              deckLogValues.wizard_id = resp['log_list'][siegewar].battle_log_list[battleLog].wizard_id;
              deckLogValues.wizard_name = resp['log_list'][siegewar].battle_log_list[battleLog].wizard_name;
              deckLogValues.opp_wizard_id = resp['log_list'][siegewar].battle_log_list[battleLog].opp_wizard_id;
              deckLogValues.opp_wizard_name = resp['log_list'][siegewar].battle_log_list[battleLog].opp_wizard_name;
              deckLogValues.win_lose = resp['log_list'][siegewar].battle_log_list[battleLog].win_lose;
              deckLogValues.log_type = resp['log_list'][siegewar].battle_log_list[battleLog].log_type;
              deckLogValues.log_timestamp = resp['log_list'][siegewar].battle_log_list[battleLog].log_timestamp;
              deckLogValues.linkPrimaryKey = deckLogValues.wizard_id + "_" + deckLogValues.opp_wizard_id + "_" + deckLogValues.log_timestamp
              deckLogLink.push(deckLogValues)
            }
          }
        }
        sendDecks.command = "SWGTSiegeDeckHistoryLink";
        sendDecks.deck_log_history = deckLogLink;
        sendResp = sendDecks;
        this.writeToFile(proxy, req, sendResp, 'SWGT3-');
        if (this.hasCacheMatch(proxy, config, req, sendResp, cache)) return;
        this.uploadToWebService(proxy, config, req, sendResp, 'SWGT');
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }
  },
  hasCacheMatch(proxy, config, req, resp, cache) {
    if (!this.hasAPISettings(config, proxy)) return false;
    var respCopy = JSON.parse(JSON.stringify(resp)); //Deep copy
    var action = respCopy['command'];

    //Remove stuff that is auto generated, time stamp or request related
    if ('log_type' in respCopy) { action += '_' + respCopy['log_type'] };
    if ('ts_val' in respCopy) { delete respCopy['ts_val'] };
    if ('tvalue' in respCopy) { delete respCopy['tvalue'] };
    if ('tvaluelocal' in respCopy) { delete respCopy['tvaluelocal'] };
    if ('reqid' in respCopy) { delete respCopy['reqid'] };
    if ('date_time_stamp' in respCopy) { delete respCopy['date_time_stamp'] };

    //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Response: " + JSON.stringify(resp) });
    if (!(action in cache)) {
      proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Not in cache:  " + action });



    } else {
      var respTest = JSON.stringify(respCopy);
      var cacheTest = JSON.stringify(cache[action]);
      
      if (cacheTest === respTest) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Matched cache:  " + action });
        return true;
      } else {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "No match cache:  " + action });
      }
      for (var k in cacheTimerSettings) {
        if (cacheTimerSettings[k].command === action) {
          var currentTime = new Date().getTime();
          var timeDifference = currentTime - cacheDuration[action];
          if (timeDifference < cacheTimerSettings[k].timer) {
            timerMinutes = cacheTimerSettings[k].timer / 60000;
            proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Time between last packet < " + timerMinutes + " minute(s) for:  " + action });
            return true;
          }
        }
      }
    };

    cache[action] = respCopy;
    cacheDuration[action] = new Date().getTime();

    return false;
  },
  verifyPacketToSend(proxy, config, req, resp) {
    verifyCheck = true;
    if ('wizard_id' in req) {
      var i = apiReference.enabledWizards.length;
      while (i--) {
        if (apiReference.enabledWizards[i] === req.wizard_id) {
          verifyCheck = true;
          i = 0;
        } else {
          verifyCheck = false;
        }
      }
    } else {
      verifyCheck = true;
    }
    proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Verify Guild: " + `${verifyCheck}` + "-" + `${resp['command']}` });
    return verifyCheck;
  },
  uploadToWebService(proxy, config, req, resp, endpointType) {
    if (!this.hasAPISettings(config, proxy)) return;
    if (!this.verifyPacketToSend(proxy, config, req, resp)) return;
    const { command } = req;

    var endpoint = "/api/v1";
    if ("3MDC" == endpointType)
      endpoint = "/api/3mdc/v1";

    let options = {
      method: 'post',
      uri: config.Config.Plugins[pluginName].siteURL + endpoint + '?apiKey=' + config.Config.Plugins[pluginName].apiKey,
      json: true,
      body: resp
    };
    //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Upload to Webservice: ${resp['command']}` });
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
          message: `${command} upload failed: Server responded with code: ${response.statusCode} = ${response.body}`
        });

        //Remove from cache if rate limited
        try {
          if (response.body.includes("updated in the past")) {
            var action = resp['command'];
            delete cache[action];
          }
        } catch (error) { }
      }
    });
  },
  checkVersion(proxy) {
    //check version number
    var endpoint = "https://swgt.io/api/v1";
    let options = {
      method: 'get',
      uri: endpoint
    };

    //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `API Version Check` });

    request(options, (error, response) => {
      if (error) {
        proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Error: ${error.message}` });
        return;
      }
      //Check current version of SWGT Plugin as listed on site.
      if (response.statusCode === 200) {
        versionResponse = JSON.parse(response.body);
        if (versionResponse.message == version) {
          proxy.log({
            type: 'success', source: 'plugin', name: this.pluginName,
            message: `Initializing version ${pluginName}_${version}. You have the latest version!`
          });
        } else {
          proxy.log({
            type: 'warning', source: 'plugin', name: this.pluginName,
            message: `Initializing version ${pluginName}_${version}. There is a new version available on GitHub. Please visit https://github.com/Cerusa/swgt-swex-plugin/releases/latest and download the latest version.`
          });
        }
      } else {
        proxy.log({
          type: 'error',
          source: 'plugin',
          name: this.pluginName,
          message: `Server responded with code: ${response.statusCode} = ${response.body}`
        });
      }
    });
  },

  checkSiteAPI(proxy, config) {
    //check site api configuration settings
    if (!this.hasAPIEnabled(config, proxy)) {
      //proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `API Settings not yet configured.` });
      return;
    }
    resp = {};
    resp.command = "checkAPIKey";
    //var endpoint = "/api/v1";
    var endpoint = "/api/guild/swgt/v1";

    let options = {
      method: 'post',
      uri: config.Config.Plugins[pluginName].siteURL + endpoint + '?apiKey=' + config.Config.Plugins[pluginName].apiKey,
      json: true,
      body: resp
    };
    //proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Check Site API settings` });
    request(options, (error, response) => {
      if (error) {
        proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Failed to connect to ${config.Config.Plugins[pluginName].siteURL}` });
        return;
      }

      if (response.statusCode === 200) {
        proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: `Successfully connected to ${config.Config.Plugins[pluginName].siteURL}` });
        siteAPIResponse = response.body;
        if ('messageType' in siteAPIResponse) { apiReference.messageType = siteAPIResponse.messageType };
        if ('enabledGuilds' in siteAPIResponse) { apiReference.enabledGuilds = siteAPIResponse.enabledGuilds };
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Guild apiReference: ${apiReference.messageType}` });
      } else if (response.statusCode === 401) {
        proxy.log({

          type: 'error',
          source: 'plugin',
          name: this.pluginName,
          message: `Failed to connect to ${config.Config.Plugins[pluginName].siteURL}: Invalid API Key.`
        });
      } else {
        proxy.log({
          type: 'error',
          source: 'plugin',
          name: this.pluginName,
          message: `Failed to connect to ${config.Config.Plugins[pluginName].siteURL}. ${response.body}`
        });
      }
    });
  },

  writeToFile(proxy, req, resp, prefix) {
    if (!config.Config.Plugins[pluginName].enabled) return;
    if (!config.Config.Plugins[pluginName].saveToFile) return;
    let filename = prefix + '-' + resp['command'] + '-' + new Date().getTime() + '.json';
    let outFile = fs.createWriteStream(path.join(config.Config.App.filesPath, filename), {
      flags: 'w',
      autoClose: true
    });

    outFile.write(JSON.stringify(resp, true, 2));
    outFile.end();
    proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: 'Saved data to '.concat(filename) });
  }
};