/* Yamaha-Plugin for homebridge
created by neonightmare www.github.com/neonightmare/homebridge-yamaha
on base of non plugin version from https://github.com/SphtKr

Configuration Sample:
"platforms": [
        {
            "platform": "YamahaAVR",
            "play_volume": -48,
            "setMainInputTo": "Airplay",
            "manual_addresses": {
            "Yamaha": "192.168.1.115"}
        }

*/

var request = require("request");
var Service, Characteristic, types, hapLegacyTypes;

var inherits = require('util').inherits;
var debug = require('debug')('YamahaAVR');
var Yamaha = require('yamaha-nodejs');
var Q = require('q');
var mdns = require('mdns');
//workaround for raspberry pi
var sequence = [
    mdns.rst.DNSServiceResolve(),
    'DNSServiceGetAddrInfo' in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({families:[4]}),
    mdns.rst.makeAddressesUnique()
];

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  types = homebridge.hapLegacyTypes;

  fixInheritance(YamahaAVRPlatform.Input, Characteristic);
  fixInheritance(YamahaAVRPlatform.InputName, Characteristic);
  fixInheritance(YamahaAVRPlatform.InputService, Service);

  homebridge.registerAccessory("homebridge-yamaha", "YamahaAVR", YamahaAVRAccessory);
  homebridge.registerPlatform("homebridge-yamaha", "YamahaAVR", YamahaAVRPlatform);
}

// Necessary because Accessory is defined after we have defined all of our classes
function fixInheritance(subclass, superclass) {
    var proto = subclass.prototype;
    inherits(subclass, superclass);
    subclass.prototype.parent = superclass.prototype;
    for (var mn in proto) {
        subclass.prototype[mn] = proto[mn];
    }
}



function YamahaAVRPlatform(log, config){
    this.log = log;
    this.config = config;
    this.zone = config["zone"] || "Main";
    this.playVolume = config["play_volume"];
    this.minVolume = config["min_volume"] || -50.0;
    this.maxVolume = config["max_volume"] || -20.0;
    this.gapVolume = this.maxVolume - this.minVolume;
    this.showInputName = config["show_input_name"] || "no";
    this.setMainInputTo = config["setMainInputTo"];
    this.expectedDevices = config["expected_devices"] || 100;
    this.discoveryTimeout = config["discovery_timeout"] || 30;
    this.manualAddresses = config["manual_addresses"] || {};
    this.browser = mdns.createBrowser(mdns.tcp('http'), {resolverSequence: sequence});
}

// Custom Characteristics and service...

YamahaAVRPlatform.Input = function() {
  Characteristic.call(this, 'Input', '00001003-0000-1000-8000-135D67EC4377');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};


YamahaAVRPlatform.InputName = function() {
  Characteristic.call(this, 'Input Name', '00001004-0000-1000-8000-135D67EC4377');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};


YamahaAVRPlatform.InputService = function(displayName, subtype) {
  Service.call(this, displayName, '00000002-0000-1000-8000-135D67EC4377', subtype);

  // Required Characteristics
  this.addCharacteristic(YamahaAVRPlatform.Input);

  // Optional Characteristics
  this.addOptionalCharacteristic(YamahaAVRPlatform.InputName);
};


YamahaAVRPlatform.prototype = {
    accessories: function(callback) {
        this.log("Getting Yamaha AVR devices.");
        var that = this;

        var browser = this.browser;
        browser.stop();
        browser.removeAllListeners('serviceUp'); // cleanup listeners
        var accessories = [];
        var timer, timeElapsed = 0, checkCyclePeriod = 5000;

        // Hmm... seems we need to prevent double-listing via manual and Bonjour...
        var sysIds = {};

        var setupFromService = function(service){
            var name = service.name;
            //console.log('Found HTTP service "' + name + '"');
            // We can't tell just from mdns if this is an AVR...
            if (service.port != 80) return; // yamaha-nodejs assumes this, so finding one on another port wouldn't do any good anyway.
            var yamaha = new Yamaha(service.host);
            yamaha.getSystemConfig().then(
                function(sysConfig){
                    var sysModel = sysConfig.YAMAHA_AV.System[0].Config[0].Model_Name[0];
                    var sysId = sysConfig.YAMAHA_AV.System[0].Config[0].System_ID[0];
                    if(sysIds[sysId]){
                        this.log("WARN: Got multiple systems with ID " + sysId + "! Omitting duplicate!");
                        return;
                    }
                    sysIds[sysId] = true;
                    this.log("Found Yamaha " + sysModel + " - " + sysId + ", \"" + name + "\"");
                    var accessory = new YamahaAVRAccessory(this.log, this.config, name, yamaha, sysConfig);
                    accessories.push(accessory);
                    if(accessories.length >= this.expectedDevices)
                        timeoutFunction(); // We're done, call the timeout function now.
                }.bind(this)
                ,
                function(error){
                    debug("DEBUG: Failed getSystemConfig from " + name + ", probably just not a Yamaha AVR.", error);
                }.bind(this)
            );
        }.bind(this);

        // process manually specified devices...
        for(var key in this.manualAddresses){
            if(!this.manualAddresses.hasOwnProperty(key)) continue;
            setupFromService({
                name: key,
                host: this.manualAddresses[key],
                port: 80
            });
        }

        browser.on('serviceUp', setupFromService);
        browser.start();

        // The callback can only be called once...so we'll have to find as many as we can
        // in a fixed time and then call them in.
        var timeoutFunction = function(){
            if(accessories.length >= that.expectedDevices){
                clearTimeout(timer);
            } else {
                timeElapsed += checkCyclePeriod;
                if(timeElapsed > that.discoveryTimeout * 1000){
                    that.log("Waited " + that.discoveryTimeout + " seconds, stopping discovery.");
                } else {
                    timer = setTimeout(timeoutFunction, checkCyclePeriod);
                    return;
                }
            }
            browser.stop();
            browser.removeAllListeners('serviceUp');
            that.log("Discovery finished, found " + accessories.length + " Yamaha AVR devices.");
            callback(accessories);
        };
        timer = setTimeout(timeoutFunction, checkCyclePeriod);
    }
};

function YamahaAVRAccessory(log, config, name, yamaha, sysConfig) {
    this.log = log;
    this.config = config;
    this.yamaha = yamaha;
    this.sysConfig = sysConfig;

    this.nameSuffix = config["name_suffix"] || " Speakers";
    this.zone = config["zone"] || 1;
    this.name = name;
    this.serviceName = name + this.nameSuffix;
    this.setMainInputTo = config["setMainInputTo"];
    this.playVolume = this.config["play_volume"];
    this.minVolume = config["min_volume"] || -50.0;
    this.maxVolume = config["max_volume"] || -20.0;
    this.gapVolume = this.maxVolume - this.minVolume;
    this.showInputName = config["show_input_name"] || "no";
}

YamahaAVRAccessory.prototype = {

    setPlaying: function(playing) {
        var that = this;
        var yamaha = this.yamaha;

        if (playing) {

            return yamaha.powerOn().then(function(){
                if (that.playVolume) return yamaha.setVolumeTo(that.playVolume*10, that.zone);
                else return Q();
            }).then(function(){
                if (that.setMainInputTo) return yamaha.setMainInputTo(that.setMainInputTo);
                else return Q();
            }).then(function(){
                if (that.setMainInputTo == "AirPlay") return yamaha.SendXMLToReceiver(
                    '<YAMAHA_AV cmd="PUT"><AirPlay><Play_Control><Playback>Play</Playback></Play_Control></AirPlay></YAMAHA_AV>'
                );
                else return Q();
            });
        }
        else {
            return yamaha.powerOff();
        }
    },

    getServices: function() {
        var that = this;
        var informationService = new Service.AccessoryInformation();
        var yamaha = this.yamaha;

        informationService
                .setCharacteristic(Characteristic.Name, this.name)
                .setCharacteristic(Characteristic.Manufacturer, "Yamaha")
                .setCharacteristic(Characteristic.Model, this.sysConfig.YAMAHA_AV.System[0].Config[0].Model_Name[0])
                .setCharacteristic(Characteristic.SerialNumber, this.sysConfig.YAMAHA_AV.System[0].Config[0].System_ID[0]);

        var switchService = new Service.Switch("Yamaha Power");
        switchService.getCharacteristic(Characteristic.On)
                .on('get', function(callback, context){
                    yamaha.isOn().then(
                        function(result){
                            callback(false, result);
                        }.bind(this), function(error){
                            callback(error, false);
                        }.bind(this)
                    );
                }.bind(this))
                .on('set', function(powerOn, callback){
                    this.setPlaying(powerOn).then(function(){
                        callback(false, powerOn);
                    }, function(error){
                        callback(error, !powerOn); //TODO: Actually determine and send real new status.
                    });
                }.bind(this));

		var audioDeviceService = new Service.Speaker("Speaker");
		audioDeviceService.addCharacteristic(Characteristic.Volume);
		var volCx = audioDeviceService.getCharacteristic(Characteristic.Volume);

                volCx.on('get', function(callback, context){
                    yamaha.getBasicInfo(that.zone).then(function(basicInfo){
                        var v = basicInfo.getVolume()/10.0;
                        var p = 100 * ((v - that.minVolume) / that.gapVolume);
                        p = p < 0 ? 0 : p > 100 ? 100 : Math.round(p);
                        debug("Got volume percent of " + p + "%");
                        callback(false, p);
                    }, function(error){
                        callback(error, 0);
                    });
                })
                .on('set', function(p, callback){
                    var v = ((p / 100) * that.gapVolume) + that.minVolume;
                    v = Math.round(v*10.0);
                    debug("Setting volume to " + v);
                    yamaha.setVolumeTo(v,that.zone).then(function(){
                        callback(false, p);
                    }, function(error){
                        callback(error, volCx.value);
                    });
                })
                .getValue(null, null); // force an asynchronous get

		var mutingCx = audioDeviceService.getCharacteristic(Characteristic.Mute);
    
          mutingCx.on('get', function(callback, context) {
              yamaha.getBasicInfo(that.zone).then(function(basicInfo){
                callback(false, basicInfo.isMuted());
              }, function(error){
                callback(error, 0);
              });
            })
            .on('set', function(v, callback){
			  var zone_name = 'Main_Zone';
			  if(that.zone != 1) {
				  zone_name = 'Zone_'+that.zone;
			  }
			  
			  var mute_xml = '<YAMAHA_AV cmd="PUT"><'+zone_name+'><Volume><Mute>';
              if(v) {
                mute_xml += 'On';
              } else {
                mute_xml += 'Off';
              }
              mute_xml += '</Mute></Volume></'+zone_name+'></YAMAHA_AV>';

              yamaha.SendXMLToReceiver(mute_xml).then(function(){
                callback(false, v);
              }, function(error){
                callback(error, mutingCx.value);
              });
            })
            .getValue(null, null); // force an asynchronous get


        var inputService = new YamahaAVRPlatform.InputService("Input Functions");

        var inputCx = inputService.getCharacteristic(YamahaAVRPlatform.Input);
        inputCx.on('get', function(callback, context) {
          yamaha.getBasicInfo().then(function(basicInfo){
            callback(false, basicInfo.getCurrentInput());
          }, function(error){
            callback(error, 0);
          });
        })
        .getValue(null, null); // force an asynchronous get
        
        if(this.showInputName == "yes") {
          inputService.addCharacteristic(YamahaAVRPlatform.InputName);
          var nameCx = inputService.getCharacteristic(YamahaAVRPlatform.InputName);
          nameCx.on('get', function(callback, context) {
            yamaha.getBasicInfo().then(function(basicInfo){
              var name = basicInfo.YAMAHA_AV.Main_Zone[0].Basic_Status[0].Input[0].Input_Sel_Item_Info[0].Src_Name[0];
              name = name.replace('Osdname:', '');
              callback(false, name);
            }, function(error){
              callback(error, 0);
            });
          })
          .getValue(null, null); // force an asynchronous get
        }

        return [informationService, switchService, audioDeviceService, inputService];

    }
};
