import React, {Component} from 'react';
import Main from './router.js'
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import Script from 'react-load-script'
import {withRouter} from 'react-router-dom'

import Header from './components/Header'
import Sidebar from './components/Sidebar'
import IncomingCallAlert from './components/Dialer/IncomingCallAlert';

import {styles} from './Style';
import './index.css'

import {withStyles} from 'material-ui/styles';
import Modal from 'material-ui/Modal';
import HomeIcon from 'material-ui-icons/Home';
import PhoneIcon from 'material-ui-icons/Phone';
import ContactsIcon from 'material-ui-icons/Contacts';

import 'typeface-roboto'

import PhoneControls from './components/Dialer/PhoneControls';
import {changeNumber, endCall, placeOutboundCall} from "./actions/phone";
import {fetchCapabilityToken, initializeDevice, scriptHasErrored, scriptLoadSuccess} from "./actions/twilio";
import {bindActionCreators} from "redux";

const theme = createMuiTheme({
  palette: {
    primary: {
      light: '#b4ffff',
      main: '#80deea',
      dark: '#4bacb8',
      contrastText: '#000000',
    },
    secondary: {
      light: '#fa5788',
      main: '#c2185b',
      dark: '#8c0032',
      contrastText: '#ffffff',
    },
  },
});


class App extends Component {
  componentWillUpdate = (nextProps, nextState) => {
    if (this.props.twilio.scriptLoaded === false && nextProps.twilio.scriptLoaded === true) {
      this.props.fetchCapabilityToken('/phonecalls/capabilityToken?client=reactweb');
    }
  };

  componentDidUpdate = (prevProps, prevState) => {
    if (prevProps.twilio.capabilityTokenReceived === false && this.props.twilio.capabilityTokenReceived === true) {
      console.log('setting up twilio device');
      this.props.initializeDevice(this.props.twilio.capabilityToken.token);
    }
  };


  render() {
    const {classes} = this.props;
    if (!this.props.twilio.scriptLoaded) {
      return (
        <Script
          url='https://media.twiliocdn.com/sdk/js/client/v1.4/twilio.min.js'
          onError={this.props.scriptHasErrored}
          onLoad={this.props.scriptLoadSuccess}
        />
      )
    }

    return (
      <MuiThemeProvider theme={theme}>
        <div className={classes.root}>
          <div className={classes.appFrame}>
            <Header title={'Dialer'}/>
            <Sidebar
              menuList={[
                {'title': 'Home', 'icon': <HomeIcon/>, 'route': '/webapp'},
                {'title': 'Dialer', 'icon': <PhoneIcon/>, 'route': '/webapp/dialer'},
                {'title': 'Contacts', 'icon': <ContactsIcon/>, 'route': '/webapp/contacts'}]}
            />
            {this.props.phone.onPhone ?
              <PhoneControls/>
              : null
            }
            <main className={classes.content}>
              <Modal
                open={this.props.phone.incomingCallRinging}
              ><IncomingCallAlert/></Modal>
              <Main/>
            </main>
          </div>
        </div>
      </MuiThemeProvider>
    )
  }
}

function mapStateToProps(state) {
  return {
    phone: state.phone,
    twilio: state.twilio,
  };
}

function mapDispatchToProps(dispatch) {
  return {
    scriptLoadSuccess: bindActionCreators(scriptLoadSuccess, dispatch),
    scriptHasErrored: bindActionCreators(scriptHasErrored, dispatch),
    fetchCapabilityToken: bindActionCreators(fetchCapabilityToken, dispatch),
    initializeDevice: bindActionCreators(initializeDevice, dispatch),

  }
}

App.propTypes = {
  classes: PropTypes.object.isRequired,
  theme: PropTypes.object.isRequired,
};

export default withStyles(styles, {withTheme: true})(
  withRouter(connect(
    mapStateToProps,
    mapDispatchToProps
  )(App)));
