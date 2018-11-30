/* 
 * Copyright (C) 2018 deroad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

module.exports = (function() {
    var _JSON = require('libdec/json64');

    function r2custom(value, regex, function_fix) {
        var x = r2cmd(value);
        if (regex) {
            x = x.replace(regex, '');
        }
        return function_fix ? function_fix(x.trim()) : x.trim();
    }

    function r2str(value, multiline) {
        var x = r2cmd(value);
        if (multiline) {
            x = x.replace(/\n/g, '');
        }
        return x.trim();
    }

    function r2json(m, def) {
        var x = r2str(m, true);
        return x.length > 0 ? _JSON.parse(x) : def;
    }

    function r2int(value, def) {
        var x = r2str(value);
        if (x != '') {
            try {
                return parseInt(x);
            } catch (e) {}
        }
        return def;
    }

    function r2bool(value) {
        var x = r2str(value);
        return x == 'true' || x == '1';
    }

    function r2_sanitize(value, expected) {
        return value.length == 0 ? expected : value;
    }

    function r2dec_sanitize(enable, evar, oldstatus, newstatus) {
        if (enable) {
            r2cmd('e ' + evar + ' = ' + newstatus);
        } else {
            r2cmd('e ' + evar + ' = ' + oldstatus);
        }
    }

    function merge_arrays(input) {
        input = input.split('\n').map(function(x){
            return x.length > 2 ? x.trim().substr(1, x.length).substr(0, x.length - 2) : '';
        });
        var array = '[' + input.filter(Boolean).join(',') + ']';
        return array;
    }

    function merge_arrays_json(input) {
        return _JSON.parse(merge_arrays(input));
    }

    var padding = '            ';
    var usages = {
        "--help": "this help message",
        "--colors": "enables syntax colors",
        "--casts": "shows all casts in the pseudo code",
        "--debug": "do not catch exceptions",
        "--html": "outputs html data instead of text",
        "--issue": "generates the json used for the test suite",
    };

    function has_option(args, name) {
        return (args.indexOf(name) >= 0);
    }

    function has_invalid_args(args) {
        for (var i = 0; i < args.length; i++) {
            if (args[i] != '' && !usages[args[i]]) {
                console.log('Invalid argument \'' + args[i] + '\'\n');
                return true;
            }
        }
        return false;
    }

    function usage() {
        console.log("r2dec [options]");
        for (var key in usages) {
            var cmd = key + padding.substr(key.length, padding.length);
            console.log("       " + cmd + " | " + usages[key]);
        }
    }

    function print_issue() {
        var symbols = r2_sanitize(r2str('isj'), '[]');
        var data = r2_sanitize(r2str('pIj $SS @ section.code'), '[]');
        var arch = r2_sanitize(r2str('e asm.arch'), '');
        console.log('{"name":"issue_' + (new Date()).getTime() +
            '","arch":"' + arch +
            '","symbols":' + symbols +
            ',"code":' + data + '}');
    }
    var r2util = {
        check_args: function(args) {
            if (has_invalid_args(args)) {
                args.push('--help');
            }
            if (has_option(args, '--help')) {
                usage();
                return true;
            }
            if (has_option(args, '--issue')) {
                print_issue();
                return true;
            }
            return false;
        },
        evarsTestSuite: function(data) {
            this.arch = data.arch;
            this.honor = {
                casts: true,
                pseudo: false,
                html: false,
                color: false
            };
            this.extra = {
                theme: 'default',
                debug: true
            };
        },
        dataTestSuite: function(x) {
            var o = _JSON.parse(x);
            return {
                arch: o.arch || 'wasm',
                code: o.code || [],
                symbols: o.symbols || [],
            };
        },
        evars: function(args) {
            this.arch = r2str('e asm.arch');
            this.archbits = r2int('e asm.bits', 32);
            this.honor = {
                casts: r2bool('e pdw.casts') || has_option(args, '--casts'),
                html: r2bool('e scr.html') || has_option(args, '--html'),
                color: r2int('e scr.color', 0) > 0 || has_option(args, '--colors')
            };
            this.sanitize = {
                ucase: r2bool('e asm.ucase'),
                pseudo: r2bool('e asm.pseudo'),
                capitalize: r2bool('e asm.capitalize'),
            };
            this.extra = {
                theme: r2str('e pdw.theme'),
                debug: true, //has_option(args, '--debug')
            };
        },
        data: function() {
            this.arch = r2str('e asm.arch');
            this.symbols = r2json('isj', []);
            this.code = r2json('pIj $SS @ section.code', []);
        },
        sanitize: function(enable, evars) {
            var s = evars.sanitize;
            r2dec_sanitize(enable, 'asm.ucase', s.ucase, 'false');
            r2dec_sanitize(enable, 'asm.pseudo', s.pseudo, 'false');
            r2dec_sanitize(enable, 'asm.capitalize', s.capitalize, 'false');
        },
        debug: function(evars, exception) {
            r2util.sanitize(false, evars);
            if (evars.extra.debug) {
                console.log('Exception:', exception.stack);
            } else {
                console.log(
                    '\n\nr2dec has crashed.\n' +
                    'Please report the bug at https://github.com/wargio/r2dec-wasm/issues\n' +
                    'Use the option \'--issue\' or the command \'pddi\' to generate \n' +
                    'the needed data for the issue.'
                );
            }
        }
    };
    return r2util;
})();
