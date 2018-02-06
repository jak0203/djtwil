import React, { Component } from 'react';
// import darkBaseTheme from 'material-ui/styles/baseThemes/darkBaseTheme';
import lightBaseTheme from 'material-ui/styles/baseThemes/lightBaseTheme';

import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import getMuiTheme from 'material-ui/styles/getMuiTheme';
import Header from './components/Header.js'
import Main from './router.js'


class App2 extends Component {
  render() {
    return (
      <MuiThemeProvider  muiTheme={getMuiTheme(lightBaseTheme)}>
        <div>
          <Header
            menuList={[
              {'title': 'Home', 'icon': 'fa fa-home', 'route': '/webapp'},
              {'title': 'Dialer', 'icon': 'fa fa-phone', 'route': '/webapp/dialer'},
              {'title': 'Contacts', 'icon': 'fa fa-users', 'route': '/webapp/contacts'}]}
            title={'Twilio App'}
            user={'Jacki Lynch'}
          />
        <Main />
        </div>
      </MuiThemeProvider>
    )
  }
}

export default App2;