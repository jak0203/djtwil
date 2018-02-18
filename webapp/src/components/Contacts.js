import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import { styles } from '../Style';

import { withStyles } from 'material-ui/styles';

import EnhancedTable from './EnhancedTable/EnhancedTable'

import { contactsFetchData } from '../actions/contacts';

const columnData = [
  { id: 'name', numeric: false, disablePadding: true, label: 'Name' },
  { id: 'phone_number', numeric: false, disablePadding: false, label: 'Phone Number' },
];

class Contacts extends Component {
  componentDidMount = () => {
    this.props.fetchData('/api/contacts/')
  };

  render() {
    if (this.props.contacts.error) {
            return <p>Sorry! There was an error loading the items</p>;
        }
        if (this.props.contacts.isLoading) {
            return <p>Loading…</p>;
        }
    return(
      <div>
        <EnhancedTable
          columnData={columnData}
          data={this.props.contacts.contacts}
          dataKey={'name'}
          tableTitle={"Contacts"}
        />
      </div>
    )
  }
}

const mapStateToProps = (state) => {
    return {
        contacts: state.contacts,
    };
};

const mapDispatchToProps = (dispatch) => {
    return {
        fetchData: (url) => dispatch(contactsFetchData(url))
    };
};

Contacts.propTypes = {
  classes: PropTypes.object.isRequired,
  theme: PropTypes.object.isRequired,
};

export default withStyles(styles, {withTheme: true})(connect(mapStateToProps, mapDispatchToProps)(Contacts));
