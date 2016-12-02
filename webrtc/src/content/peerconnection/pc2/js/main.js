/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

var startButton = document.getElementById('startButton');
var callButton = document.getElementById('callButton');
var hangupButton = document.getElementById('hangupButton');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;

var signaling1 = new WebSocket("wss://test.moshita.xyz");
var signaling2 = new WebSocket("wss://test.moshita.xyz");

var startTime;
var localVideo = document.getElementById('localVideo');
var remoteVideo = document.getElementById('remoteVideo');

localVideo.addEventListener('loadedmetadata', function() {
  trace('Local video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.addEventListener('loadedmetadata', function() {
  trace('Remote video videoWidth: ' + this.videoWidth +
    'px,  videoHeight: ' + this.videoHeight + 'px');
});

remoteVideo.onresize = function() {
  trace('Remote video size changed to ' +
    remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight);
  // We'll use the first onsize callback as an indication that video has started
  // playing out.
  if (startTime) {
    var elapsedTime = window.performance.now() - startTime;
    trace('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
    startTime = null;
  }
};

var localStream;
var pc1;
var pc2;
var offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

function getSignaling(pc) {
  return (pc === pc1) ? signaling1 : signaling2;
}

function gotStream(stream) {
  trace('Received local stream');
  localVideo.srcObject = stream;
  localStream = stream;
  callButton.disabled = false;
}

function start() {
  trace('Requesting local stream');
  startButton.disabled = true;
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true
  })
  .then(gotStream)
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });
}

function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  trace('Starting call');
  startTime = window.performance.now();
  var videoTracks = localStream.getVideoTracks();
  var audioTracks = localStream.getAudioTracks();
  if (videoTracks.length > 0) {
    trace('Using video device: ' + videoTracks[0].label);
  }
  if (audioTracks.length > 0) {
    trace('Using audio device: ' + audioTracks[0].label);
  }
  var servers = {
    "iceServers": [{"url": "stun:stun.l.google.com:19302"}]
  };
  // Set Up PC1
  pc1 = new RTCPeerConnection(servers);
  trace('Created local peer connection object pc1');
  pc1.onicecandidate = function(e) {
    onIceCandidate(pc1, e);
  };
  onIceStateChange(pc1);
  pc1.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc1, e);
  };
  pc1.onsignalingstatechange = function(e) {
    trace('pc1 signalingState ' + pc1.signalingState);
  };
  pc1.onnegotiationneeded = function(e) {
    trace('pc1 createOffer start');
    pc1.createOffer(
      offerOptions
    ).then(
      function (desc) {
        onCreateOfferSuccess(pc1, desc);
      },
      onCreateSessionDescriptionError
    );
  };
  pc1.ontrack = function(e){
    trace('pc1 onTrack ' + e.streams.length);
    trace('pc1 remoteStream.length = ' + pc.getRemoteStream().length);
    var remoteStream = e.streams[0];
    remoteVideo.srcObject = remoteStream;
    var vts = remoteStream.getVideoTracks();
    var ats = remoteStream.getAudioTracks();
    if (vts.length > 0) {
      trace('Using video device: ' + vts[0].label);
    }
    if (ats.length > 0) {
      trace('Using audio device: ' + ats[0].label);
    }
  };
  signaling1.onmessage = function (message) {
    var dataJson = JSON.parse(message.data);
    if(dataJson.sdp != undefined) {
      if(dataJson.type == 'offer') {
        receiveOffer(pc1, new RTCSessionDescription(dataJson));
      } else {
        receiveAnswer(pc1, new RTCSessionDescription(dataJson));
      }
    } else if (dataJson.candidate != null) {
      trace('Trickle Candidates are not expected');
    } else if (dataJson.command == 'resendOffer') {
      sendOffer(pc1, pc1.localDescription);
    } else {
      trace('Unknown event ' + dataJson.toString());
    }
  }

  // Set Up PC2
  pc2 = new RTCPeerConnection(servers);
  trace('Created remote peer connection object pc2');
  pc2.onicecandidate = function(e) {
    onIceCandidate(pc2, e);
  };
  onIceStateChange(pc2);
  pc2.oniceconnectionstatechange = function(e) {
    onIceStateChange(pc2, e);
  };
  pc2.onaddstream = gotRemoteStream;
  signaling2.onmessage = function (message) {
    var dataJson = JSON.parse(message.data);
    if(dataJson.sdp != undefined) {
      if(dataJson.type == 'offer') {
        receiveOffer(pc2, new RTCSessionDescription(dataJson));
      } else {
        receiveAnswer(pc2, new RTCSessionDescription(dataJson));
      }
    } else if (dataJson.candidate != null) {
      trace('Trickle Candidates are not expected');
    } else if (dataJson.command == 'resendOffer') {
      sendOffer(pc2, pc2.localDescription);
    } else {
      trace('Unknown event ' + dataJson.toString());
    }
  }

  // Start Call by adding localStream to pc1
  pc1.addStream(localStream);
  trace('Added local stream to pc1');

}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function onCreateOfferSuccess(pc, desc) {
  // pc = pc1
  trace('Offer created at ' + getName(pc));
  trace('setLocalDescription start');
  pc.setLocalDescription(desc).then(
    function() {
      onSetLocalSuccess(pc);
    },
    onSetSessionDescriptionError
  );
  
  // otherPc = pc2
  /*
  var otherPc = getOtherPc(pc);
  trace(getName(otherPc) + ' setRemoteDescription start');
  otherPc.setRemoteDescription(desc).then(
    function() {
      onSetRemoteSuccess(otherPc);
    },
    onSetSessionDescriptionError
  );
  trace(getName(otherPc) + ' createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  otherPc.createAnswer().then(
    function (desc) {
      onCreateAnswerSuccess(otherPc, desc);
    },
    onCreateSessionDescriptionError
  );
  */
}

function sendOffer(pc, desc) {
  trace(getName(pc) + ' Sending ' + desc.type);
  getSignaling(pc).send(JSON.stringify({ 'type': desc.type, 'sdp': desc.sdp}));
  //receiveOffer(targetPc, desc);
}

function receiveOffer(pc, desc) {
  trace(getName(pc) + ' received offer');
  trace(getName(pc) + ' setRemoteDescription start');
  pc.setRemoteDescription(desc).then(
    function() {
      onSetRemoteSuccess(pc);
      trace(getName(pc) + ' createAnswer start');
      // Since the 'remote' side has no media stream we need
      // to pass in the right constraints in order for it to
      // accept the incoming offer of audio and video.
      pc.createAnswer().then(
        function (desc) {
          onCreateAnswerSuccess(pc, desc);
        },
        onCreateSessionDescriptionError
      );
    },
    onSetSessionDescriptionError
  );
  /*
  trace(getName(pc) + ' createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  pc.createAnswer().then(
    function (desc) {
      onCreateAnswerSuccess(pc, desc);
    },
    onCreateSessionDescriptionError
  );
  */
}

function onSetLocalSuccess(pc) {
  trace(getName(pc) + ' setLocalDescription complete');
}

function onSetRemoteSuccess(pc) {
  trace(getName(pc) + ' setRemoteDescription complete');
}

function onSetSessionDescriptionError(error) {
  trace('Failed to set session description: ' + error.toString());
}

function gotRemoteStream(e) {
  remoteVideo.srcObject = e.stream;
  trace('received remote stream');
}

function onCreateAnswerSuccess(pc, desc) {
  // pc = pc2
  trace('Answer created at ' + getName(pc));
  trace('setLocalDescription start');
  pc.setLocalDescription(desc).then(
    function() {
      onSetLocalSuccess(pc);
      sendAnswer(pc, desc);
    },
    onSetSessionDescriptionError
  );
  
  /*
  var otherPc = getOtherPc(pc);
  trace(getName(otherPc) + ' setRemoteDescription start');
  otherPc.setRemoteDescription(desc).then(
    function() {
      onSetRemoteSuccess(otherPc);
    },
    onSetSessionDescriptionError
  );
  */
}

function sendAnswer(pc, desc) {
  trace(getName(pc) + ' Sending ' + desc.type);
  getSignaling(pc).send(JSON.stringify({ 'type': desc.type, 'sdp': desc.sdp}));
  //receiveAnswer(targetPc, desc);
}

function receiveAnswer(pc, desc) {
  trace(getName(pc) + ' received answer');
  trace(getName(pc) + ' setRemoteDescription start');
  pc.setRemoteDescription(desc).then(
    function() {
      onSetRemoteSuccess(pc);
    },
    onSetSessionDescriptionError
  );
}

function onIceCandidate(pc, event) {
  if (event.candidate) {
    /*
    getOtherPc(pc).addIceCandidate(
      new RTCIceCandidate(event.candidate)
    ).then(
      function() {
        onAddIceCandidateSuccess(pc);
      },
      function(err) {
        onAddIceCandidateError(pc, err);
      }
    );
    */
    trace(getName(pc) + ' ICE candidate: \n' + event.candidate.candidate);
  }
  else {
    trace(getName(pc) + ' ICE candidate READY');
    if(pc.iceConnectionState == 'checking' || pc.remoteDescription == undefined){
      sendAnswer(pc, pc.localDescription);
    } else {
      sendOffer(pc, pc.localDescription);
    }

  }
}

function onAddIceCandidateSuccess(pc) {
  trace(getName(pc) + ' addIceCandidate success');
}

function onAddIceCandidateError(pc, error) {
  trace(getName(pc) + ' failed to add ICE Candidate: ' + error.toString());
}

function onIceStateChange(pc, event) {
  if (pc) {
    trace(getName(pc) + ' ICE state: ' + pc.iceConnectionState);
  }
}

function hangup() {
  trace('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}
