import React, { Component } from 'react';
import axios from 'axios';
import logo from './logo.svg';
import './App.css';
//import blah from 'script-loader!./twilio.min.js'
//require('script-loader!./twilio.min.js');
import Script from 'react-load-script'

class NumberInputText extends Component {
  render() {
    return (
      <div className="input-group input-group-sm">
      <input type="tel" className="form-control" placeholder="555-666-7777"
        value={this.props.currentNumber} onChange={this.props.handleOnChange}/>
      </div>
    );
  }
}

class CallButton extends Component {
  render() {
    return (
      <button className={'btn btn-circle btn-success ' + (this.props.onPhone ? 'btn-danger': 'btn-success')}
          onClick={this.props.handleOnClick} disabled={this.props.disabled}>
        <i className={'fa fa-fw fa-phone '+ (this.props.onPhone ? 'fa-close': 'fa-phone')}></i>
      </button>
    );
  }
}

class MuteButton extends Component {
  render() {
    return (
      <button className="btn btn-circle btn-default" onClick={this.props.handleOnClick}>
        <i className={'fa fa-fw fa-microphone ' + (this.props.muted ? 'fa-microphone-slash': 'fa-microphone')}></i>
      </button>
    );
  }
}

class LogBox extends Component {
  render() {
    return (
      <div>
        <div className="log">{this.props.text}</div>
        <p>{this.props.smallText}</p>
      </div>
    );
  }
}

class DTMFTone extends Component {
  render() {
    return (null);
  }
}


class App extends Component {
  state = {
    currentNumber: '',
    isValidNumber: false,
    onPhone: false,
    phonecallToken: null,
    scriptLoaded: false,
    countryCode: 1,
    muted: false,
  }

  // Handle number input
  handleChangeNumber = (e) => {
    this.setState({
      currentNumber: e.target.value,
      isValidNumber: /^([0-9]|#|\*)+$/.test(e.target.value.replace(/[-()\s]/g,''))
    });
  };

  // Handle muting
  handleToggleMute= () => {
    var muted = !this.state.muted;

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
      })
      // make outbound call with current number
      var n = '+' + this.state.countryCode + this.state.currentNumber.replace(/\D/g, '');
      window.Twilio.Device.connect({ number: n });
      this.setState({log: 'Calling ' + n})
    } else {
      // hang up call in progress
      window.Twilio.Device.disconnectAll();
    }
  };


  handleScriptError() {
    this.setState({ scriptError: true })
  }

  handleScriptLoad() {
    this.setState({ scriptLoaded: true })
    console.log('Twilio script loaded!', window.Twilio)
  }

  render() {
    if (!this.state.scriptLoaded) {
      return (
        <Script
          url="https://media.twiliocdn.com/sdk/js/client/v1.4/twilio.js"
          onError={this.handleScriptError.bind(this)}
          onLoad={this.handleScriptLoad.bind(this)}
        />
      )
    }
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to React</h1>
        </header>
        <p className="App-intro">
          To get started, edit <code>src/App.js</code> and save to reload.
        </p>
        <button type="button" onClick={this.onClick}>Get Twilio Token</button>
        <div id="dialer">
          <div id="dial-form" className="input-group input-group-sm">
            <NumberInputText
              currentNumber={this.state.currentNumber}
              handleOnChange={this.handleChangeNumber}
            />
          </div>
          <div className="controls">
            <CallButton
              handleOnClick={this.handleToggleCall}
              disabled={!this.state.isValidNumber}
              onPhone={this.state.onPhone}
            />
            { this.state.onPhone ?
              <MuteButton handleOnClick={this.handleToggleMute} muted={this.state.muted} />
              : null
            }
          </div>
          { this.state.onPhone ? <DTMFTone/> : null }
          <LogBox text={this.state.log}/>
        </div>
      </div>
    );
  }

  onClick = (ev) => {
    console.log("Getting Twilio token!!!");
    axios.get('/phonecalls/capabilityToken/')
    .then(res => {
      console.log("res", res)
      this.setState({phonecallToken: res && res.data && res.data.token})
          window.Twilio.Device.setup(res.data.token)
    }).catch((err) => {
      console.log(err);
      this.setState({log: 'Could not fetch token, see console.log'});
    });
  }
}

export default App;
