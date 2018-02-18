import React from 'react'
import { Switch, Route } from 'react-router-dom'

import Home from './Home.js'
import Contacts from './components/Contacts.js';
import NumberInput from './components/Dialer/NumberInput';

// The Main component renders one of the provided
// Routes (provided that one matches).

const Main = () => (
  <main>
    <Switch>
      <Route exact path='/webapp' component={Home}/>
      <Route path='/webapp/dialer' component={NumberInput}/>
      <Route path='/webapp/contacts' component={Contacts}/>
    </Switch>
  </main>
);

export default Main
