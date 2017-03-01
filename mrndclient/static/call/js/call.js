(function(){
  'use strict';

  function createRequestObject(_id, _type, _data) {
    var request = {};
    request.id = _id;
    request.type = _type;
    request[_type] = _data;
    
    return {request: request};
  }
  
  window.addEventListener('DOMContentLoaded',function(){

    var inputURL = document.getElementById('url');
    var btnConnection = document.getElementById('connection');

    var inputGroupId = document.getElementById('groupId');
    var inputName = document.getElementById('name');
    var checkVideo = document.getElementById('includeVideo');
    var btnGroup = document.getElementById('group');

    var requestSFU = document.getElementById('requestSFU');
    var btnCall = document.getElementById('call');
    
    var textOutput = document.getElementById('output');
    var btnClearOutput = document.getElementById('clearOutput');

    var divLocal = document.getElementById('local');
    var divRemote = document.getElementById('remote');
    var lme;
    
    const STATUS_FLAG_CONNECTION = 1;
    const STATUS_FLAG_GROUP = 2;
    const STATUS_FLAG_CALL = 4;
    
    
    const STATUS_DISCONNECTED = 0;
    const STATUS_CONNECTED = STATUS_FLAG_CONNECTION;
    const STATUS_JOINED = STATUS_FLAG_CONNECTION | STATUS_FLAG_GROUP;
    const STATUS_IN_CALL = STATUS_FLAG_CONNECTION | STATUS_FLAG_GROUP | STATUS_FLAG_CALL;
    var status = STATUS_DISCONNECTED;
    
    const MEMBER_ID_SFU = 'SFU';
    
    var myId;
    var participants = [];
    
    var useTrickleICE = false;
    
    var servers = {
      "iceServers": [{"url": "stun:69.172.201.153"}]
    };
  
    var pcs = {};

    var ws;
    
    function updateUI() {
      
      var connected = !!(status & STATUS_FLAG_CONNECTION)
      inputURL.disabled = connected;
      btnConnection.innerHTML = connected ? 'Disconnect' : 'Connect';
      
      var ingroup = !!(status & STATUS_FLAG_GROUP)
      inputGroupId.disabled = ingroup || !connected;
      inputName.disabled = ingroup || !connected;
      btnGroup.disabled = !connected;
      btnGroup.innerHTML = ingroup ? 'Leave' : 'Join';

      var incall = !!(status & STATUS_FLAG_CALL)
      btnCall.disabled = !ingroup;
      btnCall.innerHTML = 'Call';

    }
    
    function output(log) {
      textOutput.innerHTML += log + '\n';
    }
    
    function outputError(e) {
      output('error: ' + e.toString());
    }
    
    function attachOutput(_id, _pc) {
    
      output('[' + _id + '] states: ' + _pc.connectionState
       + ', ' + _pc.iceConnectionState
        + ', ' + _pc.iceGatheringState
         + ', ' + _pc.signalingState);
    
      _pc.onconnectionstatechange = function (e) {
        output('[' + _id + '] conn state change: ' + _pc.connectionState); 
      };
      
      _pc.oniceconnectionstatechange = function (e) {
        output('[' + _id + '] ice conn state change: ' + _pc.iceConnectionState); 
      };

      _pc.onsignalingstatechange = function (e) {
        output('[' + _id + '] signaling state change: ' + _pc.signalingState); 
      };

    }
    
    function getLocalMediaStream( _cb ) {

      var lmeId = 'localMediaElement';
      var lme = document.getElementById(lmeId);
      if(lme != undefined) {
        _cb(lme.srcObject);
        return;
      } else {
        var constraint = {
          audio: true
        }
        if(checkVideo.checked) {
          constraint.video = {height: {max: 120}, width: { max: 120}};
        }
        navigator.mediaDevices.getUserMedia(constraint).then(function (stream) {
          lme = document.createElement('video');
          lme.id = lmeId;
          lme.autoplay = true;
          lme.srcObject = stream;
          divLocal.appendChild(lme);
          
          _cb(stream);
        }).catch(function(err) {
          output(err.name + ': ' + err.message);
          _cb();
        });
      }      
    }
    
    function callTo(_idArray) {
      if(_idArray.length == 0) {
        output('none to call');
        return;
      }
      
      output('call to: ' + _idArray);
      
      getLocalMediaStream(function (stream) {
        if(stream != undefined) {
          _idArray.forEach( function (id, ix, array) {
            var pc = new RTCPeerConnection(servers);
            pcs[id] = pc;
            setupConnection(id);

            pc.addStream(stream);
          });
        } else {
          output('failed to retrieve local media stream');
        }
      });
    }
    
    function sendDescription(_id, desc) {
      output('***********sending ' + desc.type);
      ws.send(JSON.stringify(createRequestObject('dummy', 'communicate', {targets: _id, message: JSON.stringify({description: desc})})));
    };
    
    function setupConnection(_id) {
      var pc = pcs[_id];

      attachOutput(_id, pc);
      
      var descriptionSent = false;

      pc.onicecandidate = function onIceCandidate(_e) {
        if(useTrickleICE) {
          if(_e.candidate != undefined) {
            ws.send(JSON.stringify(createRequestObject('dummy', 'communicate', {targets: _id, message: JSON.stringify(_e.candidate)})));
          }
        } else {
          output('iceGatheringState = ' + pc.iceGatheringState);
          if(!_e.candidate && !descriptionSent) {
            descriptionSent = true;
            sendDescription(_id, pc.localDescription);
          }
        }
      };

      pc.onnegotiationneeded = function (_e) {
        output('onNegotiationNeeded: ' + _e.toString());
        var constraint = {
          offerToReceiveAudio: 1
        };
        if(checkVideo.checked) {
          constraint.offerToReceiveVideo = 1;
        }
        pc.createOffer(constraint).then(function (desc) {
          pc.setLocalDescription(desc).then(function() {
            descriptionSent = false;
            output('localDescription is set, ice gathring state = ' + pc.iceGatheringState);
            if((useTrickleICE || pc.iceGatheringState === 'complete') && !descriptionSent) {
              descriptionSent = true;
              sendDescription(_id, desc);
            } else {
              output('localDescription is set, waiting for ice gathering for 5 sec');
              /*
              window.setTimeout(function(){
                sendLocalDescription(desc);
              }, 5000);
              */
            }
          }, outputError);
        }, outputError);      
      };

      function outputTracks(prefix, tracks) {
        tracks.forEach( function (t) {
          output(prefix + 'TID: ' + t.id + ' Type: ' + t.kind);
        });
      }
      
      function outputStreams(prefix, streams) {
        streams.forEach( function (s) {
          output(prefix + 'SID: ' + s.id);
          outputTracks(prefix + 'SID: ' + s.id + ' ', s.getTracks());
        });
      }
      
      pc.ontrack = function(_e) {
        outputTracks('onTrack: ', [ _e.track ]);
        outputStreams('TID: ' + _e.track.id + ' ', _e.streams);
        var sid = _e.streams[0].id;
        if(document.getElementById(sid) == undefined) {
          var rme = document.createElement('video');
          rme.id = sid;
          rme.srcObject = _e.streams[0];
          divRemote.appendChild(rme);
        }
        /*
        var rme = document.getElementById(_id);
        rme.srcObject = _e.streams[0];
        */
      };

      pc.onaddstream = function(_e) {
        //output('onAddStream: ' + _e.toString());
        outputStreams('onAddStream: ', [ _e.stream ]);
        
        //var rme = document.getElementById(_id);
        //rme.srcObject = _e.stream;
      };
    }
    
    function findParticipantIndexById(_id) {
      return participants.findIndex(function (elem, ix, array) {
        return _id === elem.member_id;
      });
    }
    
    function removeParticipantById(_id) {
      var ix = findParticipantIndexById(_id);
      if(0 <= ix) {
        participants.splice(ix, 1);
        output('Participant removed, length: ' + participants.length);
      }
    }
    
    function addParticipants(_participants) {
      if(Array.isArray(_participants)) {
        _participants.forEach(function(elem, ix, array) {
          var some = participants.some(function(_elem, _ix, _array) {
            if(elem.member_id === _elem.member_id) {
              participants.splice(_ix, 1, elem);
              return true;
            }
          });
          if(!some) {
            participants.push(elem);
          }
        });
      }
      
      output('Participants added/updated, length: ' + participants.length);
    }
    
    function gotRemoteDescription(_id, _desc) {
      var pc = pcs[_id];
      
      if(pc == undefined) {
        pc = new RTCPeerConnection(servers);
        pcs[_id] = pc;

        setupConnection(_id);
        
        getLocalMediaStream(function (stream) {
          if(stream != undefined) {
            if(true) {
              pc.addStream(stream);
            } else {
              stream.getTracks().forEach(function (track, ix, array){
                output('adding a track');
                pc.addTrack(track, stream);
              });
            }
          }
        });

      }
      /*
      if(document.getElementById(_id) == undefined) {
        var rme = document.createElement('video');
        rme.id = _id;
        divRemote.appendChild(rme);
      }
      */      
      output('[' + _id + '] setting Remote Description');
      pc.setRemoteDescription(_desc).then( function() {
        if(pc.signalingState == 'have-remote-offer') {
          // need to answer
          pc.createAnswer().then(function(answer) {
            output('[' + _id + '] setting Local Description');
            pc.setLocalDescription(answer).then(function() {
              output('[' + _id + '] setting Local Description completed');
              //if(pc.iceGatheringState == 'complete') {
                sendDescription(_id, answer);
              //}

              /*
              getLocalMediaStream(function (stream) {
                if(stream != undefined) {
                  if(true) {
                    pc.addStream(stream);
                  } else {
                    stream.getTracks().forEach(function (track, ix, array){
                      output('adding a track');
                      pc.addTrack(track, stream);
                    });
                  }
                }
              });
              */
            }, outputError);
          }, outputError);
        }
      }, outputError);

    }
    
    function gotCandidate(_id, _candidateInit) {
      var candidate = new RTCIceCandidate(_candidateInit);
      var pc = pcs[_id];
      output('[' + _id + '] addIceCandidate start');
      pc.addIceCandidate(candidate).then(function(){
        output('[' + _id + '] addIceCandidate success');
      }, outputError);
    }
    
    updateUI();
    
    btnConnection.addEventListener('click' , function() {
      if(status === STATUS_DISCONNECTED) {
        output('connecting to ' + inputURL.value);
        ws = new WebSocket(inputURL.value);
        
        ws.onerror = function(e) {
          output('connection error.');
        };

        ws.onopen = function(e) {
          output('connection opened.');
          status = STATUS_CONNECTED;
          updateUI();
        };

        ws.onclose = function(e) {
          output('connection closed. Code: ' + e.code);
          status = STATUS_DISCONNECTED;
          updateUI();
        };
        
        ws.onmessage = function(e) {
          var messageObj = JSON.parse(e.data);
          if(messageObj.response) {
            var response = messageObj.response;
            if(response.error_code !== 0) {
              output('response for ' + response.type + ' with error code ' + response.error_code);
            }
            if(response.type == 'join') {
              output('join successful. id = ' + response.join.you.member_id);
              myId = response.join.you.member_id;
              ws.send(JSON.stringify(createRequestObject('dummy', 'group')));
              status = STATUS_JOINED;
              updateUI();
            } else if (response.type == 'group'){
              addParticipants(response.group.members);
              if( !(status & STATUS_FLAG_CALL)) {
                if(response.group.members.some(function(m){
                  return m.member_id == MEMBER_ID_SFU;
                })) {
                  callTo([MEMBER_ID_SFU]);
                }
              }
            } else {
            }
          } else if (messageObj.event) {
            var event = messageObj.event;
            if(event.type == 'joined') {
              addParticipants([ event.joined.member ]);
              if(event.joined.member.member_id == MEMBER_ID_SFU) {
                callTo([MEMBER_ID_SFU]);
              }
            } else if (event.type == 'left') {
              removeParticipantById(event.left.member.member_id);
            } else if (event.type == 'communication') {
              var from = event.communication.from;
              var data = JSON.parse(event.communication.message);
              output('communication data: ' + ((data.description != undefined) ? data.description.type : 'candidate'));
              if(data.description !== undefined) {
                // received Description
                gotRemoteDescription(from.member_id, data.description);
              } else if(data.candidate !== undefined) {
                // received ICE Candidate
                gotCandidate(from.member_id, data);
              } else if(data.type == 'call') {
                var ixMe = data.members.indexOf(myId);
                var idsToCall = data.members.slice(ixMe + 1);
                callTo(idsToCall);
              }
            }
          }
        };
      } else {
        ws.close();
        ws = undefined;
      }
    });
    
    btnGroup.addEventListener('click' , function() {
      if(status === STATUS_CONNECTED) {
        var groupId = inputGroupId.value;
        var name = inputName.value;
        if(!groupId || !name) {
          output('mandatory field missing.');
          return;
        }
        output('joining to the group ' + groupId + ' as ' + name);
        ws.send(JSON.stringify(createRequestObject('dummy', 'join', {
          group_id: groupId,
          name: name
        })));
      } else if (status === STATUS_JOINED) {
        output('leaving the group');
        ws.send(JSON.stringify(createRequestObject('dummy', 'leave')));
        status = STATUS_CONNECTED;
        updateUI();
      } else {
        output('Group: unexpected onclick.');
      }
    });

    btnCall.addEventListener('click' , function() {
    
      if(requestSFU.checked) {
        ws.send(JSON.stringify(createRequestObject('dummy', 'sfu' )));
      } else {
        var targets = '';
        var idArray = participants.map(function(p){
          if(0 < targets.length) {
            targets += ',';
          }
          targets += p.member_id;
          return p.member_id;
        });
        
        ws.send(JSON.stringify(createRequestObject('dummy', 'communicate', {targets: targets, message: JSON.stringify({type: 'call', members: idArray})})));
        
        var ixMe = idArray.indexOf(myId);
        var idToCall = idArray.slice(ixMe + 1);
        callTo(idToCall);
      }
    });
    
    btnClearOutput.addEventListener('click' , function() {
      textOutput.innerHTML = '';
    });
        
  },false);
})();