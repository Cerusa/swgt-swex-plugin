const request = require('request');
const fs = require('fs');
const path = require('path');
const pluginName = 'SWGTLogger';
const pluginVersion = '2022-06-07_2101';
var wizardBattles = [];
var sendBattles = [];
var tempDefenseDeckInfo = [];
var observerDefenseInfo = [];
var observerAttackerList = [];

module.exports = {
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
  pluginName,
  pluginDescription: 'For SWGT Patreon subscribers to automatically ' +
    'upload various Summoners War data. Enable Character JSON to automatically update ' +
    'your guild\'s members and your player\'s units/runes/artifacts. '+
    'Enable battle uploading to automatically log defenses and counters.',
  init(proxy, config) {
    cache = {};

    var listenToSWGTCommands = [
      //Character JSON and Guild Member List
      'HubUserLogin',

      //Guild Info
      'getGuildAttendInfo',
      'GetGuildInfo',
      'GetGuildInfoByName',
      'GetGuildInfoForChat',

      //Guild War
      'GetGuildWarBattleLogByGuildId',
      'GetGuildWarBattleLogByWizardId',
      'GetGuildWarMatchLog',
      'GetGuildWarRanking',

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
      'GetGuildMazeContributeList',
	    'GetGuildMazeBattleLogByWizard',
	    'GetGuildMazeBattleLogByTile'
    ];

    var listenTo3MDCCommands = [
      //Guild War-
      'BattleGuildWarStart', //offense and defense mons
      'BattleGuildWarResult', //win/loss
      'GetGuildWarMatchupInfo', //rating_id

      //Siege
      'BattleGuildSiegeStart_v2',
      'BattleGuildSiegeResult',
      'GetGuildSiegeMatchupInfo',
	  
	    //TestingSiegeReplays
	    'GetGuildSiegeRankingInfo',//rating_id
	    'SetGuildSiegeBattleReplayData',
	  
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
	
	
	proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Listening to commands: " + listenToSWGTCommands.toString().replace(/,/g,', ')+'<br><br>'+listenTo3MDCCommands.toString().replace(/,/g,', ') });
    //Attach SWGT events
    for (var commandIndex in listenToSWGTCommands) {
      var command = listenToSWGTCommands[commandIndex];
      proxy.on(command, (req, resp) => {
        this.processRequest(command, proxy, config, req, resp, cache);
      });
    }
    //Attach 3MDC events if enabled
    if (config.Config.Plugins[pluginName].uploadBattles){
      for (var commandIndex in listenTo3MDCCommands) {
        var command = listenTo3MDCCommands[commandIndex];
        proxy.on(command, (req, resp) => {
          this.process3MDCRequest(command, proxy, config, req, resp, cache);
        });
      }
    }

	  //Attach SWGT Siege Log History Data
    if (config.Config.Plugins[pluginName].enabled){
      for (var commandIndex in listenToSWGTHistoryCommands) {
        var command = listenToSWGTHistoryCommands[commandIndex];
        proxy.on(command, (req, resp) => {
          this.processSWGTHistoryRequest(command, proxy, config, req, resp, cache);
        });
      }
    }
	
	  //Confirm SWGT plugin version and Site API Settings
	  this.checkVersion(proxy);
	  this.checkSiteAPI(proxy, config);
  },
  hasAPISettings(config, proxy) {
    if (!config.Config.Plugins[pluginName].enabled) return false;

    if (!config.Config.Plugins[pluginName].apiKey) {
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Missing API key.' });
      return false;
    }
    if (!config.Config.Plugins[pluginName].siteURL) {
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Missing Site URL.' });
      return false;
    };
    if (!config.Config.Plugins[pluginName].siteURL.includes("swgt.io")) {
      proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: 'Invalid Site URL.' });
      return false;
    }
    return true;
  },
  processRequest(command, proxy, config, req, resp, cache) {
    if (command == "HubUserLogin")
      if (!config.Config.Plugins[pluginName].sendCharacterJSON) return;

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
        'tvalue',
        'tzone',
        'server_id',
        'server_endpoint'
      ];

      //Purge all unused variables
      pruned = {}
      for (var i in requiredHubUserLoginElements) {
        //Deep copy so we can modify
        try {
          pruned[requiredHubUserLoginElements[i]] = JSON.parse(JSON.stringify(resp[requiredHubUserLoginElements[i]]));
        } catch (error) {}
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
		try{
			//wizard id from request---guild id in member list---guild id
			wizardid = req['wizard_id'];
			packetInfo = {};
			packetInfo.guilds = [];
			
			blueGuildID = 0;
			bluePosID = 0;
			for (var wizard in resp.wizard_info_list){
				if (wizardid == resp.wizard_info_list[wizard].wizard_id) {
					blueGuildID = resp.wizard_info_list[wizard].guild_id;
					
				}
			}
			
			yellowPosID = 0;
			redPosID = 0;
			for (var guild in resp.guild_list){
				if (blueGuildID == resp.guild_list[guild].guild_id){
					bluePosID = resp.guild_list[guild].pos_id;
					if (bluePosID == 1){
						yellowPosID = 2;
						redPosID = 3;
					}
					if (bluePosID == 2){
						yellowPosID = 3;
						redPosID = 1;
					}
					if (bluePosID == 3){
						yellowPosID = 1;
						redPosID = 2;
					}
				}
			}
			for (var guild in resp.guild_list){
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
				for (var base in resp.base_list){
					if (resp.base_list[base].guild_id == resp.guild_list[guild].guild_id && resp.base_list[base].base_type>1){
						towerInfo.push(resp.base_list[base].base_number);
					}
				}
				guildInfo.towers = towerInfo;
				packetInfo.guilds.push(guildInfo);
			}
			packetInfo.command = "SiegeBaseColors";
			packetInfo.siege_id=resp.match_info.siege_id;
			packetInfo.match_id=resp.match_info.match_id;
			packetInfo.guild_id=blueGuildID;
			packetInfo.date_time_stamp=resp.tvalue;
			
			resp2 = packetInfo;
			this.writeToFile(proxy, req, resp2,'SWGT');
			if (this.hasCacheMatch(proxy, config, req, resp2, cache)) return;
			this.uploadToWebService(proxy, config, req, resp2,'SWGT');
		} catch (e) {
			proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp2['command']}-${e.message}` });
      }
	}
	
    this.writeToFile(proxy, req, resp,'SWGT');
    if (this.hasCacheMatch(proxy, config, req, resp, cache)) return;
    this.uploadToWebService(proxy, config, req, resp,'SWGT');
	
	
  },
  process3MDCRequest(command, proxy, config, req, resp, cache) {
    if (!config.Config.Plugins[pluginName].uploadBattles) return false;

    if (resp['command'] == 'GetGuildWarMatchupInfo') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            //update rating id
            wizardBattles[k].guild_rating_id = resp['guildwar_match_info']['guild_rating_id'];
			wizardBattles[k].guild_id = resp['guildwar_match_info']['guild_id'];
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        if (!wizardFound) {
          wizardInfo.wizard_id = req['wizard_id'];
          wizardInfo.guild_rating_id = resp['guildwar_match_info']['guild_rating_id'];
		  wizardInfo.guild_id = resp['guildwar_match_info']['guild_id'];
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
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
			if (wizardBattles[k].match_id != resp['match_info']['match_id']){
				wizardBattles[k].observerDefenseInfo = [];
				wizardBattles[k].observerAttackerList = [];
			}
			wizardBattles[k].match_id = resp['match_info']['match_id'];
            for (var wizard in resp['wizard_info_list']){
              if (resp['wizard_info_list'][wizard].wizard_id == req['wizard_id']){
                wizardBattles[k].guild_id = resp['wizard_info_list'][wizard].guild_id;
              }		
            }
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        if (!wizardFound) {
          wizardInfo.wizard_id = req['wizard_id'];
          wizardInfo.siege_rating_id = resp['match_info']['rating_id'];
		  wizardInfo.match_id = resp['match_info']['match_id'];
		  wizardInfo.observerDefenseInfo = [];
		  wizardInfo.observerAttackerList = [];
          for (var wizard in resp['wizard_info_list']){
            if (resp['wizard_info_list'][wizard].wizard_id == req['wizard_id']){
              wizardInfo.guild_id = resp['wizard_info_list'][wizard].guild_id;
            }		
          }
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }
    if (resp['command'] == 'BattleGuildWarStart') {
      //Store only the information needed for transfer
      try {
        for (var i = 0; i < 2; i++) {
          battle = {}
          battle.command = "3MDCBattleLog";
          battle.battleType = "GuildWar";
          battle.wizard_id = resp.wizard_info.wizard_id;
          battle.wizard_name = resp.wizard_info.wizard_name;
          battle.battleKey = resp.battle_key;
          battle.defense = {}
          battle.counter = {}

          //prepare the arrays
          units = [];
          battle.defense.units = [];
          battle.counter.units = [];
		  battle.counter.unique = [];
          for (var j = 0; j < 3; j++) {
            try {
              //Offense Mons
              battle.counter.units.push(resp.guildwar_my_unit_list[i][j].unit_master_id);
			  battle.counter.unique.push(resp.guildwar_my_unit_list[i][j].unit_id);
              //Defense Mons
              battle.defense.units.push(resp.guildwar_opp_unit_list[i][j].unit_info.unit_master_id);
            } catch (e) { }
          }
          //match up wizard id and push the battle
          for (var k = wizardBattles.length - 1; k >= 0; k--) {
            if (wizardBattles[k].wizard_id == req['wizard_id']) {
              //store battle in array
              battle.battleRank = wizardBattles[k].guild_rating_id;
			  battle.guild_id = wizardBattles[k].guild_id;
              wizardBattles[k].sendBattles.push(battle);
            }
          }
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
        battle.defense = {}
        battle.counter = {}

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
    if (req['command'] == 'BattleGuildWarResult') {
      var j = 1;
      try {//Handle out of order processing
        for (var wizard in wizardBattles) {
          for (var k = wizardBattles[wizard].sendBattles.length - 1; k >= 0; k--) {
            if (wizardBattles[wizard].sendBattles[k].battleKey == req['battle_key']) {
              wizardBattles[wizard].sendBattles[k].win_lose = req['win_lose_list'][j];
              wizardBattles[wizard].sendBattles[k].battleDateTime = resp.tvalue - j;
              j--;
              sendResp = wizardBattles[wizard].sendBattles[k];
              //remove battle from the sendBattlesList
              wizardBattles[wizard].sendBattles.splice(k, 1);
              //if result then add time and win/loss then send to webservice
              if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0 && sendResp.battleRank >= 4000) {
                this.writeToFile(proxy, req, sendResp,'3MDC-'+k);

                this.uploadToWebService(proxy, config, req, sendResp,'3MDC');
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `GW Battle End Processed ${k}` });
              }
            }
          }
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `GW Battle End Error ${e.message}` });
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
              j++;
              sendResp = wizardBattles[wizard].sendBattles[k];
              //remove battle from the sendBattlesList
              wizardBattles[wizard].sendBattles.splice(k, 1);
              //if 3 mons in offense and defense then send to webservice
              if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0 && sendResp.battleRank >= 4000) {
                this.writeToFile(proxy, req, sendResp,'3MDC-'+k);

                this.uploadToWebService(proxy, config, req, sendResp,'3MDC');
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
	
	if (req['command'] == 'SetGuildSiegeBattleReplayData') {
		//If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        wizardInfo = {}
        wizardFound = false;
        for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardBattles[k].sendBattles = [];
            wizardFound = true;
          }
        }
        if (!wizardFound) {
          wizardInfo.wizard_id = resp.replay_info.wizard_id;
          wizardInfo.sendBattles = [];
          wizardBattles.push(wizardInfo);
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
	  try {
		  if (resp.replay_info.guild_id == resp.replay_info.opp_guild_id) {
				  battle = {}
				  battle.command = "3MDCBattleLog";
				  battle.battleType = "SiegeTest";
				  battle.wizard_id = resp.replay_info.wizard_id;
				  battle.wizard_name = resp.replay_info.wizard_name;
				  battle.battleKey = resp.replay_info.battle_key;
				  battle.guild_id = resp.replay_info.guild_id;
				  battle.opp_wizard_id = resp.replay_info.opp_wizard_id;
				  battle.opp_wizard_name = resp.replay_info.opp_wizard_name;
				  battle.battleRank = 4001;
				  battle.defense = {}
				  battle.counter = {}

				//prepare the arrays
				units = [];
				battle.defense.units = [];
				battle.counter.units = [];
				battle.counter.unique = [];
				for (var j = 0; j < 3; j++) {
				  try {
					
					//Defense Mons
					battle.defense.units.push(resp.replay_info.opp_unit_info[j][2]);
					//Offense Mons
					battle.counter.units.push(resp.replay_info.unit_info[j][2]);
					battle.counter.unique.push(resp.replay_info.unit_info[j][1]);
				  } catch (e) { }
				}
				//match up wizard id and push the battle
				for (var k = wizardBattles.length - 1; k >= 0; k--) {
				  if (wizardBattles[k].wizard_id == req['wizard_id']) {
					battle.battleRank = wizardBattles[k].siege_rating_id;
					wizardBattles[k].sendBattles.push(battle);
				  }
				}
		  }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
		
	  //send the request like the siege result to the server
      var j = 0;
      try {
        for (var wizard in wizardBattles) {
          for (var k = wizardBattles[wizard].sendBattles.length - 1; k >= 0; k--) {
            //TODO: Handle multiple accounts with GW and Siege going at the same time. match battlekey and wizard. then do battles 1 and 2 and delete from the mon list.
            if (wizardBattles[wizard].sendBattles[k].battleKey == resp.replay_info.battle_key) {
              wizardBattles[wizard].sendBattles[k].win_lose = resp.replay_info.win_lose;
              wizardBattles[wizard].sendBattles[k].battleDateTime = resp.tvalue - j;
              j++;
              sendResp = wizardBattles[wizard].sendBattles[k];
              //remove battle from the sendBattlesList
              wizardBattles[wizard].sendBattles.splice(k, 1);
              //if 3 mons in offense and defense then send to webservice
              if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0) {
                this.writeToFile(proxy, req, sendResp,'3MDC-'+k);

                this.uploadToWebService(proxy, config, req, sendResp,'3MDC');
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Test Battle Processed ${k}` });
              }
            }
          }
        }
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Test Battle Error ${e.message}` });
      }
      if (j == 1) {
        j = 0;
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
		var wizardIndex=0; //match wizardID
		 for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardIndex = k;
          }
        }
        defenseInfo = {}
		tempDefenseDeckInfo = [];
		sendDecks = {}
        

        for (var deck in resp['defense_deck_list']){
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
              unitCount ++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 2 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount ++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id ==3 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount ++;
            }
          }
          //sort mon2 and mon3
          if (unitCount == 3) {
            if(defenseInfo.mon3 < defenseInfo.mon2) {
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
				if(defenseInfo.deck_id == resp['defense_deck_status_list'][defenseUnitStatus].deck_id) {
					defenseInfo.attack_wizard_id = resp['defense_deck_status_list'][defenseUnitStatus].attack_wizard_id;
					defenseInfo.battle_start_time = resp['defense_deck_status_list'][defenseUnitStatus].battle_start_time;
				}
			}
			//check if defense exists first
			for (var k = wizardBattles[wizardIndex].observerDefenseInfo.length-1; k >= 0; k--) {
				if(wizardBattles[wizardIndex].observerDefenseInfo[k].deck_id == defenseInfo.deck_id && 
				wizardBattles[wizardIndex].observerDefenseInfo[k].attack_wizard_id == defenseInfo.attack_wizard_id && 
				wizardBattles[wizardIndex].observerDefenseInfo[k].battle_start_time == defenseInfo.battle_start_time){
					//observerDefenseInfo.push(defenseInfo) 
					defenseFound = true;
				}
			}
			if (defenseFound == false){
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
		 var wizardIndex=0; //match wizardID
		 for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardIndex = k;
          }
        }
        attackInfo = {}
		tempDefenseDeckInfo = [];
		sendDecks = {}
        

        for (var deck in resp['guildsiege_attack_unit_list']){
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
              unitCount ++;
			  
            }
            if (resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].pos_id == 2) {
              attackInfo.uniqueMon2 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_id;
              attackInfo.mon2 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_master_id;
              unitCount ++;
            }
            if (resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].pos_id == 3) {
              attackInfo.uniqueMon3 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_id;
              attackInfo.mon3 = resp['guildsiege_attack_unit_list'][deck].unit_list[attackUnit].unit_master_id;
              unitCount ++;
            }
          }
          //sort mon2 and mon3
          if (unitCount == 3) {
            if(attackInfo.mon3 < attackInfo.mon2) {
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
			for (var k = wizardBattles[wizardIndex].observerAttackerList.length-1; k >= 0; k--) {
				if(wizardBattles[wizardIndex].observerAttackerList[k].deck_id == attackInfo.deck_id && 
				wizardBattles[wizardIndex].observerAttackerList[k].attack_wizard_id == attackInfo.attack_wizard_id && 
				wizardBattles[wizardIndex].observerAttackerList[k].deckPrimaryKey == attackInfo.deckPrimaryKey){
					//observerDefenseInfo.push(defenseInfo) 
					attackFound = true;
				}
			}
			if (attackFound == false){
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
	if (req['command'] == 'GetGuildSiegeBattleLog' && resp['log_type']==1) {
      try {
		var wizardIndex=0; //match wizardID
		 for (var k = wizardBattles.length - 1; k >= 0; k--) {
          if (wizardBattles[k].wizard_id == req['wizard_id']) {
            wizardIndex = k;
          }
        }  
        for (var battle1 = resp['log_list'][0].battle_log_list.length - 1; battle1 >= 0; battle1--) {  //go through each recorded offense
		//first see if you can find a defense that matches by base number
          for (var k = wizardBattles[wizardIndex].observerDefenseInfo.length - 1; k >= 0; k--) {
            if (resp['log_list'][0].battle_log_list[battle1].base_number==wizardBattles[wizardIndex].observerDefenseInfo[k].base_id && 
			resp['log_list'][0].battle_log_list[battle1].opp_wizard_id == wizardBattles[wizardIndex].observerDefenseInfo[k].wizard_id){
				//once a defense is found, search the attacker list to find any matches for this base, and attack log
				var defenseDefeated = false;
				for (var j = wizardBattles[wizardIndex].observerAttackerList.length -1; j>=0;j--){
					
					if(resp['log_list'][0].battle_log_list[battle1].wizard_id == wizardBattles[wizardIndex].observerAttackerList[j].attack_wizard_id && 
						wizardBattles[wizardIndex].observerAttackerList[j].deck_id==wizardBattles[wizardIndex].observerDefenseInfo[k].deck_id &&
						wizardBattles[wizardIndex].observerDefenseInfo[k].battle_start_time<wizardBattles[wizardIndex].observerAttackerList[j].battle_start_time && 
						wizardBattles[wizardIndex].observerAttackerList[j].battle_start_time<resp['log_list'][0].battle_log_list[battle1].log_timestamp) {
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
						if (battle.win_lose==1) {
							defenseDefeated = true;
						}
						battle.battleDateTime = resp['log_list'][0].battle_log_list[battle1].log_timestamp;
						battle.battleKey = Number(battle.wizard_id.toString() + battle.battleDateTime.toString());
						sendResp = battle;
						if (sendResp.defense.units.length == 3 && sendResp.counter.units.length > 0 && sendResp.battleRank >= 0) {
							req['command']="SiegeObserverBattle";
							this.writeToFile(proxy, req, sendResp,'3MDC-Obs3-'+j+'-'+k+'-');
							this.uploadToWebService(proxy, config, req, sendResp,'3MDC');
							proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `Siege Observer End Processed ${wizardBattles[wizardIndex].observerAttackerList[j].attack_wizard_name}` });
					  }
					  wizardBattles[wizardIndex].observerAttackerList.splice(j,1);
					}
				} //end attacker loop check
				//if one of the attackers defeated the defense then remove this defense from the observerdefense array
				if (defenseDefeated){
					wizardBattles[wizardIndex].observerDefenseInfo.splice(k,1);
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
	  if (resp['command'] == 'GetGuildSiegeBaseDefenseUnitList' || resp['command']=='GetGuildSiegeBaseDefenseUnitListPreset' || resp['command']=='GetGuildSiegeDefenseDeckByWizardId') {
      //If wizard id and rating doesn't exist in wizardBattles[] then push to it
      try {
        defenseInfo = {}
		tempDefenseDeckInfo = [];
		sendDecks = {}
        defenseFound = false;

        for (var deck in resp['defense_deck_list']){
          defenseInfo = {};
          defenseInfo.wizard_id = resp['defense_deck_list'][deck].wizard_id;
          defenseInfo.deck_id = resp['defense_deck_list'][deck].deck_id;
          unitCount = 0;
          for (var defenseUnit in resp['defense_unit_list']) {
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 1 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon1 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon1 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount ++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id == 2 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon2 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount ++;
            }
            if (defenseInfo.deck_id == resp['defense_unit_list'][defenseUnit].deck_id && resp['defense_unit_list'][defenseUnit].pos_id ==3 && resp['defense_unit_list'][defenseUnit].hasOwnProperty('unit_info')) {
              defenseInfo.uniqueMon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_id;
              defenseInfo.mon3 = resp['defense_unit_list'][defenseUnit].unit_info.unit_master_id;
              unitCount ++;
            }
          }
          //sort mon2 and mon3
          if (unitCount == 3) {
            if(defenseInfo.mon3 < defenseInfo.mon2) {
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
        this.writeToFile(proxy, req, sendResp,'SWGT2-');
		    if (this.hasCacheMatch(proxy, config, req, sendResp, cache)) return;
        this.uploadToWebService(proxy, config, req, sendResp,'SWGT');
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
		    deckLogLink=[]
			deckwizardID = 0;
		    
        //find the deckid info that matches in the tempDefenseDeckInfo
        for (var k = tempDefenseDeckInfo.length - 1; k >= 0; k--) {
			if (tempDefenseDeckInfo[k].deck_id == req['target_deck_id']) {
				deckIDPrimaryKey = tempDefenseDeckInfo[k].wizard_id.toString() + "_" + tempDefenseDeckInfo[k].uniqueMon1.toString() + "_" + tempDefenseDeckInfo[k].uniqueMon2.toString() + "_" + tempDefenseDeckInfo[k].uniqueMon3.toString();
				deckwizardID = tempDefenseDeckInfo[k].wizard_id;
			}
        }
        for ( var siegewar in resp['log_list']){
          for (var battleLog in resp['log_list'][siegewar].battle_log_list){
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
        this.writeToFile(proxy, req, sendResp,'SWGT3-');
		if (this.hasCacheMatch(proxy, config, req, sendResp, cache)) return;
        this.uploadToWebService(proxy, config, req, sendResp,'SWGT');
      } catch (e) {
        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: `${resp['command']}-${e.message}` });
      }
    }
  },
  hasCacheMatch(proxy, config, req, resp, cache) {
    if (!this.hasAPISettings(config, proxy)) return false;

    var action = resp['command'];
    if ('log_type' in resp) { action += '_' + resp['log_type'] };
	  if ('ts_val' in resp) { delete resp['ts_val'] };

    if (
      resp['command'] != 'HubUserLogin' &&
      resp['command'] != 'VisitFriend' &&

      resp['command'] != 'GetGuildInfo' &&
      resp['command'] != 'GetGuildInfoByName' &&
      resp['command'] != 'GetGuildInfoForChat' &&

      resp['command'] != 'GetGuildWarRanking' &&

      resp['command'] != 'GetGuildSiegeRankingInfo' &&
	    resp['command'] != 'GetGuildMazeContributeList' &&
	    resp['command'] != 'GetGuildMazeStatusInfo' &&
	    resp['command'] != 'GetGuildMazeBattleLogByWizard' && 

      resp['command'] != 'GetGuildSiegeRankingInfo' && 
      resp['command'] != 'GetGuildSiegeMatchupInfo' && 
      resp['command'] != 'GetGuildSiegeMatchupInfoForFinished' &&
      resp['command'] != 'GetGuildSiegeBattleLog' && 
      resp['command'] != 'GetGuildSiegeBattleLogByWizardId'
    ) {
      if ('tvalue' in resp) { delete resp['tvalue'] };
    }
    if ('tvaluelocal' in resp) { delete resp['tvaluelocal'] };
    
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
  uploadToWebService(proxy, config, req, resp,endpointType) {
    if (!this.hasAPISettings(config, proxy)) return;
    const { command } = req;

    var endpoint = "/api/v1";
    if("3MDC" == endpointType)
      endpoint = "/api/3mdc/v1";

    let options = {
      method: 'post',
      uri: config.Config.Plugins[pluginName].siteURL + endpoint+'?apiKey=' + config.Config.Plugins[pluginName].apiKey,
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
  checkVersion(proxy){
	  //check version number
	  var endpoint = "https://swgt.io/api/v1";
	  let options = {
      method: 'get',
      uri: endpoint
    };
	  request(options, (error, response) => {
      if (error) {
        proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Error: ${error.message}` });
        return;
      }
	    //Check current version of SWGT Plugin as listed on site.
      if (response.statusCode === 200) {
		    versionResponse = JSON.parse(response.body);
		    if (versionResponse.message == pluginVersion) {
			    proxy.log({type:'success',source:'plugin',name:this.pluginName,
			    message:`Initializing version ${pluginName}_${pluginVersion}. You have the latest version!`});
		    } else {
			    proxy.log({type:'warning',source:'plugin',name:this.pluginName,
			    message:`Initializing version ${pluginName}_${pluginVersion}. There is a new version available on GitHub. Please visit https://github.com/Cerusa/swgt-swex-plugin/releases/latest and download the latest version.`});
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
  checkSiteAPI(proxy, config){
	  //check site api configuration settings
	  if (!this.hasAPISettings(config, proxy)) {
		  //proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `API Settings not yet configured.` });
		  return;
	  }
  	resp = {};
	  resp.command = "checkAPIKey";
    var endpoint = "/api/v1";

	  let options = {
      method: 'post',
      uri: config.Config.Plugins[pluginName].siteURL + endpoint+'?apiKey=' + config.Config.Plugins[pluginName].apiKey,
      json: true,
      body: resp
    };

    request(options, (error, response) => {
      if (error) {
        proxy.log({ type: 'error', source: 'plugin', name: this.pluginName, message: `Failed to connect to ${config.Config.Plugins[pluginName].siteURL}` });
        return;
      }

      if (response.statusCode === 200) {
        proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: `Successfully connected to ${config.Config.Plugins[pluginName].siteURL}` });
      } else if ( response.statusCode === 401) {
		    proxy.log({
          type: 'error',
          source: 'plugin',
          name: this.pluginName,
          message: `Failed to connect to ${config.Config.Plugins[pluginName].siteURL}: Invalid API Key.`
        });
	    } else  {
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
    let filename = prefix+'-' + resp['command'] + '-' + new Date().getTime() + '.json';
    let outFile = fs.createWriteStream(path.join(config.Config.App.filesPath, filename), {
      flags: 'w',
      autoClose: true
    });

    outFile.write(JSON.stringify(resp, true, 2));
    outFile.end();
    proxy.log({ type: 'success', source: 'plugin', name: this.pluginName, message: 'Saved data to '.concat(filename) });
  }
};