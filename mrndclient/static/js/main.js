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
    var btnGroup = document.getElementById('group');

    var inputCommunicateTo = document.getElementById('communicateTo');
    var inputMessage = document.getElementById('message');
    var btnCommunicate = document.getElementById('communicate');
    
    var textOutput = document.getElementById('output');
    var btnClearOutput = document.getElementById('clearOutput');
    
    const STATUS_DISCONNECTED = "disconnected";
    const STATUS_CONNECTED = "connected";
    const STATUS_JOINED = "joined";
    var status = STATUS_DISCONNECTED;

    var ws;
    
    function updateUI() {
      switch(status) {
        case STATUS_DISCONNECTED:
          inputURL.disabled = false;
          btnConnection.disabled = false;
          btnConnection.innerHTML = 'Connect';
          
          inputGroupId.disabled = true;
          inputName.disabled = true;
          btnGroup.disabled = true;
          btnGroup.innerHTML = 'Join';
        break;
        case STATUS_CONNECTED:
          inputURL.disabled = true;
          btnConnection.disabled = false;
          btnConnection.innerHTML = 'Disconnect';
          
          inputGroupId.disabled = false;
          inputName.disabled = false;
          btnGroup.disabled = false;
          btnGroup.innerHTML = 'Join';
        break;
        case STATUS_JOINED:
          inputGroupId.disabled = true;
          inputName.disabled = true;
          btnGroup.innerHTML = 'Leave';
        break;
      }
    }
    
    function output(log) {
      textOutput.innerHTML += log + '\n';
    }
    
    updateUI();
    
    btnConnection.addEventListener('click' , function() {
      if(status === STATUS_DISCONNECTED) {
        output('connecting to ' + inputURL.value);
        ws = new WebSocket(inputURL.value);
        
        ws.onerror = function(event) {
          event
          output('connection error.');
        };

        ws.onopen = function(event) {
          output('connection opened.');
          status = STATUS_CONNECTED;
          updateUI();
        };

        ws.onclose = function(event) {
          output('connection closed. Code: ' + event.code);
          status = STATUS_DISCONNECTED;
          updateUI();
        };
        
        ws.onmessage = function(event) {
          var messageObj = JSON.parse(event.data);
          if(messageObj.response) {
            var response = messageObj.response;
            output('response for ' + response.type + ' with error code ' + response.error_code);
            if(response.type == 'join') {
              output('join successful. id = ' + response.join.you.member_id);
              status = STATUS_JOINED;
              updateUI();
            }
          } else if (messageObj.event) {
            output('event received: ' + event.data);
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
    
    btnCommunicate.addEventListener('click' , function() {
      var targetsStr = inputCommunicateTo.value.replace(/\s+/g, '');
      if(targetsStr.length == 0) {
        ws.send(JSON.stringify(createRequestObject('dummy', 'communicate', {message: inputMessage.value})));
      } else {
        ws.send(JSON.stringify(createRequestObject('dummy', 'communicate', {targets: targetsStr.split(','), message: inputMessage.value})));
      }
    });
    
    btnClearOutput.addEventListener('click' , function() {
      textOutput.innerHTML = '';
    });
        
  },false);
})();