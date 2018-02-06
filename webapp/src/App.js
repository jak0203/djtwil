import React, { Component } from 'react';
import axios from 'axios';
// import logo from './logo.svg';
import './App.css';
import Script from 'react-load-script'
import Paper from 'material-ui/Paper'
import TextField from 'material-ui/TextField';
import FloatingActionButton from 'material-ui/FloatingActionButton';
// import FontIcon from 'material-ui/FontIcon';


const PaperStyle = {
  // height: 00,
  width: 400,
  margin: 20,
  padding: 20,
  textAlign: 'center',
  display: 'inline-block',
};


class LogBox extends Component {
  render() {
    let {smallText} = this.props;
    return (
      <div className="row top-buffer" id="log">
        <div className="col-xs-12">{this.props.text}</div>
        <p>{smallText}</p>
      </div>
    );
  }
}

class DTMFTone extends Component {
  render() {
    return (null);
  }
}

class Dialer extends Component {
  render () {
    return (
      <div className="row">
        <div className="col-md-6">
          <TextField
            hintText={'555-666-7777'}
            value={this.props.currentNumber}
            onChange={this.props.handleOnChange}
          />
        </div>
        <div className="col-md-2" />
        <div className="col-md-4">
          <FloatingActionButton
            backgroundColor={'green'}
            onClick={this.props.handleOnClick}
            disabled={this.props.disabled}
            iconClassName='fa fa-phone'
          />
        </div>
      </div>
    );
  }
}

class PhoneControls extends Component {
  render() {
    return (
      <div className="row" id="phone-controls">
        <div className="col-xs-6">
          <FloatingActionButton
            backgroundColor={'red'}
            onClick={this.props.handleOnClick}
            disabled={this.props.disabled}
            iconClassName="fa fa-phone fa-rotate-135"
          />
          <p id="button-label">End Call</p>
        </div>
        <div className="col-xs-6">
          <FloatingActionButton
            onClick={this.props.handleToggleMute}
            iconClassName={'fa fa-microphone ' + (this.props.muted ? 'fa-microphone-slash': 'fa-microphone')}

          />
          <p id="button-label">Mute</p>
        </div>
      </div>
    );
  }
}

class IncomingCallAlert extends Component {
  render() {
    return (
      <div className="row" id="incoming-alert">
        {/*<div className="col-xs">*/}
        {/*<h4>Incoming call from {this.props.caller}</h4>*/}
        {/*</div>*/}
        <div className="col-xs top-buffer" id="incoming-buttons">
          <div className="col-xs-4">
            <FloatingActionButton
              backgroundColor={'green'}
              onClick={this.props.accept}
              iconClassName={'fa fa-phone'}
            />
            <p id="button-label">Accept</p>
          </div>
          <div className="col-xs-4">
            <FloatingActionButton
              onClick={this.props.ignore}
              iconClassName={'fa fa-phone fa-rotate-135'}
            />
            <p id="button-label">Ignore</p>
          </div>
          <div className="col-xs-4">
            <FloatingActionButton
              backgroundColor={'red'}
              onClick={this.props.reject}
              iconClassName={'fa fa-phone fa-rotate-135'}
            />
            <p id="button-label">Reject</p>
          </div>
        </div>
      </div>
    );
  }
}




class App extends Component {
  state = {
    scriptLoaded: false,
    scriptError: false,
    phonecallToken: null,
    countryCode: 1,
    currentNumber: '',
    isValidNumber: false,
    onPhone: false,
    muted: false,
    incomingCallRinging: false,
    incomingCaller: 'Unknown',
  };

  // Handle number input
  handleChangeNumber = (e) => {
    this.setState({
      currentNumber: e.target.value,
      isValidNumber: this.isValidNumber(e.target.value)
    })
  };

  // Check if the phone number is valid
  isValidNumber = (number) => /^([0-9]|#|\*)+$/.test(number.replace(/[-()\s]/g,''));

  // When click on a row on the contact list, validate and set the number as current number
  onNumberSelect = (number) => {
    this.setState({
      currentNumber: number,
      isValidNumber: this.isValidNumber(number),
    });
  };

  // Handle muting
  handleToggleMute = () => {
    let muted = !this.state.muted;
    this.setState({muted: muted});
    window.Twilio.Device.activeConnection().mute(muted);
  };

  // Make an outbound call with the current number,
  // or hang up the current call
  handleToggleCall = () => {
    if (!this.state.onPhone) {
      this.setState({
        muted: false,
        onPhone: true
      });
      console.log('twilio device', window.Twilio);
      // make outbound call with current number
      let n = '+' + this.state.countryCode + this.state.currentNumber.replace(/\D/g, '');
      window.Twilio.Device.connect({ To: n });
      this.setState({log: 'Calling ' + n})
    } else {
      // hang up call in progress
      window.Twilio.Device.disconnectAll();
    }
  };

  incomingCallEvent = (conn) => {
    console.log('Incoming call from ', conn.parameters.From);
    if (!this.state.onPhone) {
      //show a pop up with incomingCallAlert
      this.setState({
        log: 'Incoming call from ' + conn.parameters.From,
        incomingCallRinging: true,
        incomingCaller: conn.parameters.From,
        incomingCallAccept: () => {
          conn.accept();
          this.setState({
            incomingCallRinging: false,
            muted: false,
            onPhone: true,
            log: 'Incoming call accepted',
          });
        },
        incomingCallIgnore: () => {
          conn.ignore();
          this.setState({
            log: 'Incoming call ignored',
            incomingCallRinging: false,
          });
        },
        incomingCallReject: () => {
          conn.reject();
          this.setState({
            log: 'Incoming call rejected',
            incomingCallRinging: false,
          });
        }
      })
    } else {
      conn.ignore();
    }
  };

  setupIncomingCall = () => {
    window.Twilio.Device.incoming(this.incomingCallEvent);
    window.Twilio.Device.cancel(() => {
      this.setState({
        incomingCallRinging: false,
        log: 'Incoming call canceled',
        incomingCallAccept: null,
        incomingCallIgnore: null,
        incomingCallReject: null,
      });
    });
  };

  getCapabilityToken = () => {
    axios.get('/phonecalls/capabilityToken?client=reactweb')
      .then(res => {
        this.setState({phonecallToken: res && res.data && res.data.token});
        window.Twilio.Device.setup(res.data.token);
        console.log('Twilio device setup', window.Twilio);
        this.setState({log: 'Ready to call'});
        // Configure event handlers for Twilio Device
        window.Twilio.Device.disconnect( () => {
          this.setState({
            onPhone: false,
            log: 'Call ended'
          });
        });
        window.Twilio.Device.ready( () => {
          this.log = 'Connected';
          this.setupIncomingCall();
        });
      })
      .catch((err) => {
        console.log(err);
        this.setState({log: 'Could not fetch token, see console.log'});
      });
  };

  handleScriptError() {
    this.setState({ scriptError: true })
  };

  handleScriptLoad = () => {
    this.setState({ scriptLoaded: true });
    console.log('Twilio script loaded!', window.Twilio);
    this.getCapabilityToken();
    // this.getContactList();
  };

  render() {
    if (!this.state.scriptLoaded) {
      return (
        <Script
          url="https://media.twiliocdn.com/sdk/js/client/v1.4/twilio.min.js"
          onError={this.handleScriptError.bind(this)}
          onLoad={this.handleScriptLoad.bind(this)}
        />
      )
    }
    return (
      <div className="App">
        <Paper style={PaperStyle} zDepth={4}>
          <div className="container" id="App-body">

            { (this.state.onPhone === false && this.state.incomingCallRinging === false)
              ? <Dialer
                currentNumber={this.state.currentNumber}
                handleOnChange={this.handleChangeNumber}
                handleOnClick={this.handleToggleCall}
                disabled={!this.state.isValidNumber}
                onPhone={this.state.onPhone}
              />
              : null
            }

            { this.state.onPhone
              ? <PhoneControls
                handleOnClick={this.handleToggleCall}
                handleToggleMute={this.handleToggleMute}
                muted={this.state.muted}
              />
              : null
            }

            { this.state.incomingCallRinging
              ? <IncomingCallAlert
                accept={this.state.incomingCallAccept}
                ignore={this.state.incomingCallIgnore}
                reject={this.state.incomingCallReject}
                caller={this.state.incomingCaller}
              />
              : null
            }

            { this.state.onPhone
              ? <DTMFTone/>
              : null
            }

            <LogBox text={this.state.log}/>


          </div>
        </Paper>
      </div>
    );
  }
}

export default App;
