import React, { Component } from 'react'

class Home extends Component {
  render () {
    let {user} = this.props;
    return (
    <div>
      <h1>Welcome {user}</h1>
    </div>
    )
  }
}

export default Home