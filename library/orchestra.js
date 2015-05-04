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
 * Module dependencies
 */
var _ = require( 'lodash' ),
	NPromise = require( 'promise' ),
	Player = require( './player' );

/**
 * Creates a Docker Orchestra to manage a group of Docker Containers
 *
 * This object is intended to manage a grouping of Docker containers that
 * depend on each other. It does this utilizing Player objects that each
 * represent a single Docker container. All of the interaction with Docker
 * itself happens in the Player object, this simply organizes them and
 * ensures commands happen in the correct order.
 *
 * Player object definitions MUST be passed to the Orchestra constructor.
 * This is an array of objects. They can either be pre-constructed Player
 * objects, or it can be an object that looks like this:
 * 
 * { name: '', volume: '', options: {} }
 *
 * These values will be used to construct a new Player object for use in
 * the Orchestra.
 *
 * Once each of the defs has become a player object, each is inspected for
 * it's dependencies. All needed depenedencies must be available in the defs
 * that were sent, or the Orchestra will throw an error.
 *
 * Once dependencies have been discovered, the Orchestra then runs through
 * the list of Player object and ferrets out an order that will allow the
 * containers to be run with all needed dependencies available. If there is
 * a circular dependency loop it will detect it and throw and error.
 *
 * @param {Array} defs Objects representing Player definitions.
 */
function Orchestra( defs ){
	if ( ! _.isArray( defs ) ) {
		throw new Error( 'Pass an array of Player definition objects.' );
	}

	// create players.
	this._players = {};
	_.each( defs, Orchestra.helpers.assignSeat, this );
	// Discover each Player's dependencies.
	_.each( this._players, Orchestra.helpers.discoverDeps, this );
	// Create a dependency driven execution order.
	Orchestra.helpers.orderPlayers.call( this );
	// Bind methods to the object so they alway run with the right context
	_.bindAll( this, [ 'get', 'conduct', 'conductPlayer', 'run', 'start', 'stop', 'restart', 'destroy' ] );
}

/**
 * Gets a single Player object out of the Orchestra and returns it.
 *
 * @param  {String}      player The name of the player to get.
 * @return {Player|null}        The Player object, or null on failure.
 */
function get( player ) {
	return ( this._players[ player ] ) ? this._players[ player ].player : null;
}

/**
 * Runs a command on each Player in the ordered using dependencies.
 *
 * This loops through each player in this._playOrder and runs a command
 * on each, chaining promises with then to ensure each operation happens
 * synchronously. When complete, it fulfills the promise it returns with
 * and array of results from each of the command operations.
 *
 * If an result fails, it rejects the returned promise with the failure.
 *
 * an options object controls how the command is run. Currently it only
 * support 'omit' which will omit a container or an array of containers
 * from running the command.
 *
 * @param {String} command The command to send to each of the containers
 * @param {Object} options Optional. The options for running this command.
 */
function conduct( command, options ) {
	var i, length, results = [], self = this,
		promise = NPromise.resolve( true );

	// Validate options
	options = ( _.isObject( options ) ) ? options : {};
	options.omit = ( _.isArray( options.omit ) ) ? options.omit : [ options.omit ];

	return new NPromise( function( fulfill, reject ) {
		for ( i = 0, length = self._playOrder.length; i < length; i++ ) {
			// if this container is in the except list, skip it.
			if ( -1 !== options.omit.indexOf( self._playOrder[ i ] ) ) {
				continue;
			}
			// Run the command.
			promise = promise.then( _conduct.bind( self, self._playOrder[ i ] ), reject );
		}
		// Finish off the chain sending back the results.
		promise.then( function( result ){
			results.push( result );
			fulfill( results );
		}, reject );
	});

	/**
	 * Culminates all of the results into an array for final resolution.
	 *
	 * Takes the result of the previous command and adds it to the results
	 * array, which is hidden in the conduct closure. It then sends the
	 * command for the next player object and returns it for chaining.
	 *
	 * @param  {result}  result The result from a single command.
	 * @return {Promise}        The promise object of the sent command.
	 */
	function _conduct( player, result ){
		if ( true !== result ) {
			results.push( result );
		}
		return this.conductPlayer( player, command );
	}
}

/**
 * Sends a command to a single player, conducting it.
 *
 * Gets a player object out of the orchestra and runs a single method on it. Uses
 * a promise to repesent the sent command so that the access for aysychronous and
 * synchronous methods are consistent.
 *
 * @param  {String}   playerName The name of the player in the Orchestra to run.
 * @param  {String}   command    The command to run on the player object
 * @return {NPromise}            A promise object representing the command.
 */
function conductPlayer( playerName, command, results ) {
	var player = this.get( playerName );
	return new NPromise( function( fulfill, reject ){

		if ( ! player ) {
			reject( 'I am not aware of the ' + playerName + ' player.' );
		}
		if ( ! _.isFunction( player[ command ] ) ) {
			reject( 'This player does not have a ' + command + ' method.' );
		}
		fulfill( player[ command ]() );
	} );
}

/**
 * Runs through each definition and creates a Player as needed.
 *
 * This helper function is stashed in the Orchestra.helpers object so
 * it is accessible, yet kept more hidden as this is intended as an
 * internal use only function.
 *
 * The method should be run with an Orchestra object as the context.
 *
 * @param  {Object} def Either a Player object, or an object definition.
 */
function _assignSeat( def ) {
	var player;
	// Make sure we were passed an object.
	if ( ! _.isObject( def ) ) {
		throw new Error( 'Player definitions must be objects' );
	}
	// Turn a basic definition into a player object as needed.
	if ( def instanceof Player ) {
		player = def;
	} else {
		player = new Player( def.name, def.image, def.options );
	}

	this._players[ player.name ] = {
		player: player,
		deps: []
	};
}

/**
 * Discovers the needed dependencies for a Player object and stores it.
 *
 * This helper function is stashed in the Orchestra.helpers object so
 * it is accessible, yet kept more hidden as this is intended as an
 * internal use only function.
 *
 * The method should be run with an Orchestra object as the context.
 * 
 * @param  {Player} player The Player object representing a Docker container.
 */
function _discoverDeps( player ) {
	var volumes = player.player.get( 'volumesFrom' ),
		links = player.player.get( 'links' );

	player.deps = _.union( volumes, _.values( links ) );
	_.each( player.deps, Orchestra.helpers.verifyDeps, this );
}

/**
 * Verifies that a needed depencency is available in this Orchestra object.
 *
 * If the Orchestra object doesn't know about a dependency, it can't be sure
 * that the dependency is available when running a container. This function is
 * used for mapping each player dependency and check to ensure it is defined
 * within the Orchestra.
 *
 * This helper function is stashed in the Orchestra.helpers object so
 * it is accessible, yet kept more hidden as this is intended as an
 * internal use only function.
 *
 * The method should be run with an Orchestra object as the context.
 * 
 * @param  {[type]} dep The dependency name to verify
 */
function _verifyDeps( dep ) {
	if ( _.isUndefined( this._players[ dep ] ) ) {
		throw new Error( dep + ' is not defined and is a dependency.' );
	}
}

/**
 * Creates a run order for the Players in the Orchestra.
 *
 * For Docker to work correctly, containers being linked from or otherwise
 * required for --volumes-from need to be run before the container that needs
 * them. This function creates an ordered array of names which is stored at
 * this._playOrder and used when it is time to run the containers.
 *
 * The order is created by looping through each Player and then examing each
 * dependency. If the dependecy is located after it in the order array, it is
 * moved to the end, and the check index is moved back one to ensure we actually
 * hit each of the needed dependency.
 *
 * A max value is checked with each iteration. If items are moved around more
 * than the max value, there is a circular dependency in the system and an
 * error is thrown.
 *
 * This helper function is stashed in the Orchestra.helpers object so
 * it is accessible, yet kept more hidden as this is intended as an
 * internal use only function.
 *
 * The method should be run with an Orchestra object as the context.
 */
function _orderPlayers() {
	var i, max, d, depCount, player, movingItem, moveCount = 0;

	this._playOrder = _.keys( this._players );

	for ( i = 0, max = this._playOrder.length; i < max; i++ ) {
		// Make sure we don't appear to be in an infinite loop.
		if ( moveCount >= max ) {
			throw new Error( 'There appears to be a dependency cirlce in your containers.' );
		}
		// Get the player object.
		player = this._players[ this._playOrder[ i ] ];
		for ( d = 0, depCount = player.deps.length; d < depCount; d++ ) {
			if ( _.indexOf( this._playOrder, player.deps[ d ] ) > i ) {
				movingItem = this._playOrder[ i ];
				this._playOrder.splice( i, 1 );
				this._playOrder.push( movingItem );
				i--;
				moveCount ++;
				break;
			}
		}
	}
}

/**
 * Creates a helper that will send preset specific commands to each player.
 *
 * The promise object will return an array of results for all of the
 * container objects ordered by this._playOrder.
 *
 * @return {Function} A function preset to run a specific command.
 */
function _presetConduct( command ) {
	/**
	 * Runs a preset conduct command.
	 *
	 * @param  {object} options The options for running this command.
	 * @return {Promise}        A promis object for all the sent commands.
	 */
	return function conductCommand( options ){
		return this.conduct( command, options );
	};
}

// Export the helpers attached into the Function con
Orchestra.helpers = {
	assignSeat: _assignSeat,
	discoverDeps: _discoverDeps,
	verifyDeps: _verifyDeps,
	orderPlayers: _orderPlayers,
	presetConduct: _presetConduct,
};

// Send the methods into the object prototype.
_.extend( Orchestra.prototype, {
	get: get,
	conduct: conduct,
	conductPlayer: conductPlayer,
	run: Orchestra.helpers.presetConduct( 'run' ),
	start: Orchestra.helpers.presetConduct( 'start' ),
	stop: Orchestra.helpers.presetConduct( 'stop' ),
	restart: Orchestra.helpers.presetConduct( 'restart' ),
	destroy: Orchestra.helpers.presetConduct( 'destroy' )
} );

// Actually export the constructor.
module.exports = Orchestra;