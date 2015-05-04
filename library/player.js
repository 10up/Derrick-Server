/*!
 * Derrick CLI
 *
 * 10up <sales@10up.com>
 * John Bloch <john.bloch@10up.com>
 * Eric Mann <eric.mann@10up.com>
 * Luke Woodward <luke.woodward@10up.com>
 * Taylor Lovett <taylor.lovett@10up.com>
 *
 * MIT License.
 */

'use strict';

/**
 * Module dependencies.
 */
var _ = require( 'lodash' ),
	NPromise = require( 'promise' ),
	cpExec = NPromise.denodeify( require( 'child_process' ).exec );

/**
 * Default values for this Object.
 *
 * @type {Object}
 */
var defaults = {
	volumes: {},
	volumesFrom: [],
	links: {},
	ports: [],
	hosts: {},
	env: {},
	entrypoint: false,
	command: false,
	restartPolicy: false
};
// Let's get recursive.
defaults.defaults = defaults;

/**
 * Constructor for creating a Docker Player for the Docker Orchestra.
 *
 * Requires a name and image to be passed. Options is optional and allows
 * pre-population of attributes used as flags when the container is run.
 *
 * @param {string} name    The name to run this container under
 * @param {string} image   The Docker image to run this continer in.
 * @param {object} options Optional. Prepopulates runtime flag options.
 */
function Player( name, image, options ) {
	// Force options into an object.
	options = options || {};

	// Verify Name
	if ( ! _.isString( name ) ) {
		throw new Error( 'The container name must be a string' );
	}
	if ( ! _.isString( image ) ) {
		throw new Error( 'The container must be set to create a player.' );
	}

	// Set up object.
	Object.defineProperty( this, 'name', { value: name } );
	Object.defineProperty( this, 'image', {value: image } );
	this.defaults = _.defaults( options.defaults || {}, defaults );
	delete( options.defaults );
	this.add( options );

	// Bind methods to the object so they alway run with the right context
	_.bindAll( this, [ 'getInfo', 'run', 'start', 'stop', 'restart', 'destroy' ] );
}

/**
 * Adds values to a whitelisted set of keys on the Player object.
 *
 * Only keys defined in the defaults array can be updated or added to with
 * the add method. Other keys will trigger an error.
 *
 * If the key being added is an object, the key/value pair will be added
 * to the object. If it is an Array, the value will get merged into the 
 * current array. Finally if it is neither, the affect of add is to 
 * overwrite the value that was stored with the one passed.
 *
 * @param {Object} options A set of key/value pairs to add to the object.
 */
function add( options ){
	// Validate and whitelist options.
	options = _.pick( _.defaults( options || {}, defaults ), _.keys( defaults ) );
	_.each( options, function( value, key ){
		if( _.isArray( this.defaults[ key ] ) ) {
			this[ key ] = this[ key ] || this.defaults[ key ];
			this[ key ] = _.union( this[ key ], value );
		} else if ( _.isObject( this.defaults[ key ] ) ) {
			if ( ! _.isObject( value ) ) {
				throw new Error( 'You must pass an object to add to an object.' );
			}
			this[ key ] = _.extend( this[ key ] || {}, value );
		} else {
			this[ key ] = value;
		}
	}.bind( this ) );
}

/**
 * Gets an available value from the player object and returns it.
 *
 * This getter helps normalize access to the various values stored in the
 * Player object. All data access should happen through this getter rather
 * than directly asking the object for it. This also makes sure that should
 * the requested value not be set, the default value for that key is
 * returned instead.
 *
 * @param  {string} key The key to retrieve from the object.
 * @return {mixed}      
 */
function get( key ){
	return ( ! _.isNull( this[ key ] ) ) ? this[ key ] : this.defaults[ key ];
}

/**
 * Reset a value to a new value, or to it's default value.
 *
 * If a value is not provided, then this will set the value to the
 * default value instead.
 *
 * @param  {string} key   The key to reset on the Player object.
 * @param  {mixed}  value Optional. The value to reset the key to.
 */
function reset( key, value ){
	if ( _.isNull( this.defaults[ key ] ) ) {
		throw new Error( 'This key is not supported at this time.' );
	}

	delete( this.key );
	this.add( { key: value || this.defaults[ key ] } );
}

/**
 * Returns a parsed JS object version of the Docker container info.
 *
 * This method is very useful for determining the current state of a
 * container. If the returned promise fails, you can pretty safely
 * assume the reason is the container doesn't exist yet, where if it
 * succeeds, then the container exists.
 *
 * @return {Promise} A promise object representing the sent command.
 */
function getInfo() {
	return cpExec( 'sudo docker inspect ' + this.get( 'name' ) )
		.then( function( info ){
			return _.first( JSON.parse( info ) );
		} );
}

/**
 * Compiles and runs the Docker container this Player represents.
 *
 * If the container has already been run, this will simply restart the
 * container instead.
 *
 * All of the arguments will be parsed out into their resulting flags and then
 * executed in the shell.
 *
 * @return {Promise} A promise object representing the sent command.
 */
function run() {
	return this.getInfo()
		.then( _.identity, function(){
			// There's probably a better way to do this..
			// Eventually we'll switch to directly talking with
			// the Docker Daemon, so for now I'll just be lazy
			// and manually build a big run command.. :)
			var command = 'sudo docker run -d --name ' + this.get( 'name' );
			// Set up restart policy
			if ( !! this.get( 'restartPolicy' ) ) {
				command += ' --restart ' + this.get( 'restartPolicy' );
			}
			// Set up volumes
			_.each( this.get( 'volumes' ), function( value, key ) {
				command += ' -v ' + key + ':' + value;
			});
			// Set up volumes-from
			_.each ( this.get( 'volumesFrom' ), function( value ) {
				command += ' --volumes-from ' + value;
			});
			// Set up links
			_.each( this.get( 'links' ), function( value, key ) {
				command += ' --link ' + value + ':' + key;
			});
			// Set up exposed ports
			_.each( this.get( 'ports' ), function( value ) {
				if ( _.isObject( value ) ) {
					command += ' -p ' + value.to + ':' + value.from;
				} else {
					command += ' -p ' + value;
				}
			});
			// Set up extra hosts
			_.each( this.get( 'hosts' ), function( value, key ) {
				command += ' --add-host ' + key + ':' + value;
			});
			// Set up extra environment vars
			_.each( this.get( 'env' ), function( value, key ) {
				command += ' -e ' + key + '="' + value + '"';
			});
			// Set up custom entry point.
			if ( this.get( 'entrypoint' ) ) {
				command += ' --entrypoint ' + this.get( 'entrypoint' );
			}
			// Call the requested image.
			command += ' ' + this.get( 'image' );
			// Set up custom command.
			if ( this.get( 'command' ) ) {
				command += ' ' + this.get( 'command' );
			}

			// Make it so.
			return cpExec( command )
				.then( this.getInfo.bind( this ) );

		}.bind( this ) );
}

/**
 * Runs `docker start` on this container.
 *
 * @return {Promise} A promise object representing the sent command.
 */
function start() {
	return cpExec( 'sudo docker start ' + this.get( 'name' ) );
}

/**
 * Runs `docker stop` on this container.
 *
 * @return {Promise} A promise object representing the sent command.
 */
function stop() {
	return cpExec( 'sudo docker stop ' + this.get( 'name' ) );
}

/**
 * Runs `docker restart` on this container.
 *
 * @return {Promise} A promise object representing the sent command.
 */
function restart() {
	return cpExec( 'sudo docker restart ' + this.get( 'name' ) );
}

/**
 * Runs `docker rm` on this container. Stop it first if it's running.
 *
 * This removes the container from Docker. To get it going again requires
 * a call to .run().
 * 
 * @return {Promise} A promise object representing the sent command.
 */
function destroy() {
	return this.getInfo()
		.then( function( info ){
			if ( _.isObject( info.State ) && info.State.Running ) {
				return this.stop();
			}
		}.bind( this ) )
		.then( cpExec.bind( this, 'sudo docker rm ' + this.get( 'name' ) ) );
}

// Send the functions into the Player prototype.
_.extend( Player.prototype, {
	add: add,
	get: get,
	reset: reset,
	getInfo: getInfo,
	run: run,
	start: start,
	stop: stop,
	restart: restart,
	destroy: destroy
});

// Export the Player constructor.
module.exports = Player;
