import React, { Component } from 'react';
import axios from 'axios';
import logo from './logo.svg';
import './App.css';
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

// render contact list
class ContactList extends Component {
  render() {
    return (
      <table className="table table table-bordered table-hover table-striped">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone Number</th>
          </tr>
        </thead>
        <tbody>
          {this.props.contactList.map((element) => {
            return(
              <tr key={element.name} onClick={() => this.props.onNumberSelect(element.phone_number)}>
                <td>{element.name}</td>
                <td>{element.phone_number}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
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
    scriptError: false,
    contacts: [],
  }

  // Handle number input
  handleChangeNumber = (e) => {
    this.setState({
      currentNumber: e.target.value,
      isValidNumber: this.isValidNumber(e.target.value)
    });
  };

  // Check if the phone number is valid
  isValidNumber = (number) => /^([0-9]|#|\*)+$/.test(number.replace(/[-()\s]/g,''))

  onNumberSelect = (number) => {
    this.setState({
      currentNumber: number,
      isValidNumber: this.isValidNumber(number),
    });
  }

  // Handle muting
  handleToggleMute = () => {
    var muted = !this.state.muted;
    this.setState({muted: muted});
    window.Twilio.Device.activeConnection().mute(muted);
  };

  // Make an outbound call with the current number,
  // or hang up the current call
  handleToggleCall = (ev) => {
    if (!this.state.onPhone) {
      this.setState({
        muted: false,
        onPhone: true
      });
      console.log('twilio device', window.Twilio);
      // make outbound call with current number
      var n = '+' + this.state.countryCode + this.state.currentNumber.replace(/\D/g, '');
      window.Twilio.Device.connect({ To: n });
      this.setState({log: 'Calling ' + n})
    } else {
      // hang up call in progress
      window.Twilio.Device.disconnectAll();
    }
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
          log: 'Call ended.'
        });
      });
      window.Twilio.Device.ready( () => {
        this.log = 'Connected';
      });
    })
    .catch((err) => {
      console.log(err);
      this.setState({log: 'Could not fetch token, see console.log'});
    });
  }

  getContactList = () => {
    axios.get('/api/contacts/')
    .then(res => {
      console.log(res);
      this.setState({contacts: res.data})
    })

  }

  handleScriptError() {
    this.setState({ scriptError: true })
  };

  handleScriptLoad = () => {
    this.setState({ scriptLoaded: true })
    console.log('Twilio script loaded!', window.Twilio);
    this.getCapabilityToken();
    this.getContactList();
  }

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
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to the Twilio Dialer</h1>
        </header>
        <p></p>
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
        <div className="Contacts">
          <ContactList
            contactList={this.state.contacts}
            onNumberSelect={this.onNumberSelect}
          />
        </div>

      </div>
    );
  }
}

export default App;
