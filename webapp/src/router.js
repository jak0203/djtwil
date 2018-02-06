import React from 'react'
import { Switch, Route } from 'react-router-dom'
import App from './App.js'
// import App2 from './App2.js'
import Home from './Home.js'
import Contacts from './Contacts.js'

// The Main component renders one of the three provided
// Routes (provided that one matches). Both the /roster
// and /schedule routes will match any pathname that starts
// with /roster or /schedule. The / route will only match
// when the pathname is exactly the string "/"
const Main = () => (
  <main>
    <Switch>
      <Route exact path='/webapp' component={Home}/>
      <Route path='/webapp/dialer' component={App}/>
      <Route path='/webapp/contacts' component={Contacts}/>
    </Switch>
  </main>
)

export default Main
