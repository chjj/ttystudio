const commands = {
	record: require('./record'),
	encode: require('./encode'),
	play: require('./play'),
};


/*
 * Return a promise for an exit code.
 */
module.exports = {
	run: function run(argparse_output) {
		const {cmd_name} = argparse_output;

		return commands[cmd_name](argparse_output);
	},
};