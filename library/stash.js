/*!
  * In-memory JS Cache
  *
  * Eric Mann <eric.mann@10up.com>
  *
  * MIT License
  */

'use strict';

/**
  * Module dependencies
  */
var _ = require( 'lodash' );

/**
 * Build up our cache object.
 *
 * Similar to tools like Memcached, our object allows for simple, in-memory data persistence. Nothing is ever written to
 * or read from the disk, so everything is very fast. Unlike static caches, though, every element in the Stash will
 * automatically expire after some set duration (or, if 0 is passed for the expiration, never.
 *
 * @constructor
 */
function Stash() {
	var now = Date.now();

	// Set up our object
	Object.defineProperty( this, '_uptime', { get: function() { return ( Date.now() - now ) / 1000; } } );

	/**
	 * The internal cache object is a nested object containing objects. Data is stored in the "storage" component while
	 * key-specific timeouts are stored in the invalidators section. In the illustration below, key2 in the default group
	 * is set to never expire.
	 *
	 * {
	 *   storage: {
	 *     'default': {
	 *       'key1': {Object},
	 *       'key2': {Array},
	 *       'key3': {Object}
	 *     }
	 *   },
	 *   invalidators: {
	 *     'default': {
	 *       'key1': {Timeout},
	 *       'key3': {Timeout}
	 *     }
	 *   }
	 * }
	 *
	 * @type {Object}
	 *
	 * @private
	 */
	this._cache = {
		'storage'     : {},
		'invalidators': {}
	};
}

/**
 * Utility function for creating a purge mechanism.
 *
 * @param {Stash}  stash   Cache object
 * @param {String} key     Cache key
 * @param {String} group   Cache group
 * @param {Number} expires Expiration in seconds
 *
 * @returns {Number} Timeout ID
 *
 * @private
 */
function _purger( stash, key, group, expires ) {
	var deleter = (function ( stash, key, group ) {
		return function () {
			stash.delete( key, group );
		};
	})( stash, key, group );

	return setTimeout( deleter, 1000 * expires );
}

/**
 * Add an item to the cache if the key does not exist.
 *
 * If the key already exists, the function will return false.
 *
 * @param {String} key        Name of the data to cache
 * @param {*}      data       Actual data being cached
 * @param {String} [group]    Cache grouping (defaults to 'default')
 * @param {Number} [expire=0] Expiration (defaults to 0 - infinity)
 *
 * @return {Boolean} False on duplicate key
 */
function add_item( key, data, group, expire ) {
	// Validate the group and expiration
	group = group || 'default';
	expire = parseInt( expire, 10 );

	// Make sure our groups exist
	this._cache.storage[group] = this._cache.storage[group] || {};
	this._cache.invalidators[group] = this._cache.invalidators[group] || {};

	// If the item already exists, abort
	if ( undefined !== this._cache.storage[group][key] ) {
		return false;
	}

	// Store the item
	this._cache.storage[group][ key ] = data;

	// If we're persisting forever, just return
	if ( undefined === expire || 0 == expire ) {
		return true;
	}

	// Build a cache purge mechanism and set up a timer after which we delete the data.
	this._cache.invalidators[group][key] = _purger( this, key, group, expire );

	return true;
}

/**
 * Add an item to the cache. If the key already exists, overwrite the data.
 *
 * @param {String} key        Name of the data to cache
 * @param {*}      data       Actual data being cached
 * @param {String} [group]    Cache grouping (defaults to 'default')
 * @param {Number} [expire=0] Expiration (defaults to 0 - infinity)
 *
 * @return {Boolean}
 */
function set_item( key, data, group, expire ) {
	// Validate the group and expiration
	group = group || 'default';
	expire = parseInt( expire, 10 );

	// Make sure our groups exist
	this._cache.storage[group] = this._cache.storage[group] || {};
	this._cache.invalidators[group] = this._cache.invalidators[group] || {};

	// Delete the old item, just in case
	this.delete( key, group );

	// Now add the new data
	return this.add( key, data, group, expire );
}

/**
 * Replace an item in the cache if the key exists.
 *
 * If the key does not exists, the function will return false.
 *
 * @param {String} key        Name of the data to cache
 * @param {*}      data       Actual data being cached
 * @param {String} [group]    Cache grouping (defaults to 'default')
 * @param {Number} [expire=0] Expiration (defaults to 0 - infinity)
 *
 * @return {Boolean} False on missing key
 */
function replace_item( key, data, group, expire ) {
	// Validate the group and expiration
	group = group || 'default';
	expire = parseInt( expire, 10 );

	// Make sure our groups exist
	this._cache.storage[group] = this._cache.storage[group] || {};
	this._cache.invalidators[group] = this._cache.invalidators[group] || {};

	// If the item doesn't exist, abort
	if ( undefined === this._cache.storage[group][key] ) {
		return false;
	}

	// Overwrite the item
	return this.set( key, data, group, expire );
}

/**
 * Get data cached in the Stash
 *
 * @param {String} key     Name of the data to retrieve
 * @param {String} [group] Cache grouping
 *
 * @return {*}
 */
function get_item( key, group ) {
	// Validate the group and expiration
	group = group || 'default';

	// Make sure our groups exist
	this._cache.storage[group] = this._cache.storage[group] || {};

	// Return the item (Could be undefined)
	return this._cache.storage[group][key];
}

/**
 * Clear the cache for a given key.
 *
 * @param {String} key     Cache key to clear
 * @param {String} [group] Cache grouping
 *
 * @return {Boolean}
 */
function delete_item( key, group ) {
	group = group || 'default';

	// Make sure our groups exist
	this._cache.storage[group] = this._cache.storage[group] || {};
	this._cache.invalidators[group] = this._cache.invalidators[group] || {};

	// Kill the timeout first
	if ( undefined !== this._cache.invalidators[group][key] ) {
		clearTimeout( this._cache.invalidators[group][key] );
		this._cache.invalidators[group][key] = undefined;
	}

	// Delete the data
	this._cache.storage[group][key] = undefined;

	return true;
}

/**
 * Clear an entire cache group.
 *
 * @param {String} group Cache grouping
 *
 * @return {Boolean}
 */
function delete_group( group ) {
	group = group || 'default';

	// Make sure our groups exist
	this._cache.storage[group] = this._cache.storage[group] || {};
	this._cache.invalidators[group] = this._cache.invalidators[group] || {};

	// Clear out all of the data in said group
	_.forEach( _.keys( this._cache.storage[group] ), function( key ) {
		this.delete( key, group )
	} );

	return true;
}

/**
 * Flush the entire cache.
 *
 * @return {Boolean}
 */
function flush() {
	_.forEach( _.keys( this._cache.invalidators ), delete_group );

	return true;
}

// Add our custom functions onto the object prototype
_.extend( Stash.prototype, {
	add         : add_item,
	set         : set_item,
	replace     : replace_item,
	get         : get_item,
	delete      : delete_item,
	delete_group: delete_group,
	flush       : flush
} );

// Export the constructor
module.exports = Stash;