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
    var Base = require('libdec/core/base');
    var Variable = require('libdec/core/variable');
    var Extra = require('libdec/core/extra');
    var _counters = {
        globals: 0,
        locals: 0,
        args: 0,
        labels: 0,
    };

    var _bits = function(o) {
        if (typeof o == 'object') {
            o = o.parsed.type;
        }
        switch (o) {
            case 'f32':
                return 32;
            case 'f64':
                return 64;
            case 'i64':
                return 64;
            default:
                return 32;
        }
    };

    var _type = function(o, unsigned) {
        if (typeof o == 'object') {
            o = o.type;
        }
        switch (o) {
            case 'f32':
                return 'float';
            case 'f64':
                return 'double';
            case 'i64':
                return unsigned ? 'uint64_t' : 'int64_t';
            default:
                return unsigned ? 'uint32_t' : 'int32_t';
        }
    };

    var Global = function(type, data) {
        this.type = type || 'i32';
        this.name = "global_" + _counters.globals;
        _counters.globals++
            this.define = function() {
                return _type(this.type) + " " + this.name;
            };
        this.value = function() {
            return this.name;
        };
        this.toString = this.value;
    };

    var Argv = function(type, data) {
        this.is_arg = true;
        this.type = type || 'i32';
        this.name = "arg_" + (_counters.args++);
        this.define = function() {
            return _type(this.type) + " " + this.name;
        };
        this.value = function() {
            return this.name;
        };
        this.toString = this.value;
    };

    var Local = function(type, data) {
        this.type = type || 'i32';
        this.name = "local_" + (_counters.locals++);
        this.define = function() {
            return _type(this.type) + " " + this.name;
        };
        this.value = function() {
            return this.name;
        };
        this.toString = this.value;
    };

    var Const = function(type, data) {
        this.type = type || 'i32';
        this.data = data || 0;
        this.define = function() {};
        this.value = function() {
            return this.data;
        };
        this.toString = this.value;
    };

    var Condition = function(condition) {
        this.type = 'i32';
        this.condition = condition;
        this.value = function() {
            return this.condition;
        };
        this.toString = this.value;
    };

    var StackMath = function(mathop, routine) {
        this.mathop = mathop;
        this.routine = routine;
        this.position = routine.code.length;
        this.value = function() {
            this.routine.code.splice(this.position, 1);
            return this.mathop.toString();
        };
    };

    var Result = function(type, data) {
        this.type = type || 'i32';
        this.data = data || 0;
        this.print = function() {
            //this.link.print();
        };
        this.value = function() {
            if (this.data.value) {
                return this.data.value();
            }
            return this.data;
        };
        this.toString = this.value;
    };

    var _cmp = {
        eq: ' == ',
        ne: ' != ',
        eqz: ' == ',
        nez: ' != ',
        gt_s: ' > ',
        gt_u: ' > ',
        ge_s: ' >= ',
        ge_u: ' >= ',
        lt_s: ' < ',
        lt_u: ' < ',
        le_s: ' <= ',
        le_u: ' <= ',
        gt: ' > ',
        ge: ' >= ',
        lt: ' < ',
        le: ' <= '
    };

    var _conditional = function(instr, current, session) {
        var b = current.stack.pop().value();
        var a = current.stack.pop().value();
        var cmp = _cmp[instr.parsed.mnem];
        current.stack.push(new Condition(a + cmp + b));
    };

    var _conditional_zero = function(instr, current, session) {
        var b = '0';
        var a = current.stack.pop().value();
        var cmp = _cmp[instr.parsed.mnem];
        current.stack.push(new Condition(a + cmp + b));
    };

    var _math = function(instr, current, session, op, unsigned) {
        // TODO: handle unsigned
        var source_b = current.stack.pop();
        var source_a = current.stack.pop();
        var destination = new Result(instr.parsed.type, op(source_a.value(), source_b.value()));
        current.stack.push(destination);
    };

    var _common_load = function(instr, current, session) {
        var pointer = current.stack.pop().value();
        var offset = parseInt(instr.parsed.opd[instr.parsed.opd.length - 1] || '0');
        var bits = parseInt(instr.parsed.type.match(/\d+/)[0]) / 8;
        var signed = instr.parsed.mnem.endsWith('_s');
        session.memory['memory_u8'] = 'uint8_t';
        bits /= 8;
        if (offset > 0) {
            if (pointer.match(/^\d+$/)) {
                offset += parseInt(pointer);
            } else {
                offset = pointer + " + " + offset;
            }
        }
        var mem = new Variable.pointer('memory_u8 + ' + offset, _bits(instr), signed);
        current.stack.push(new Const(instr.parsed.type, mem.toString()));
    };

    var _common_store = function(instr, current, session) {
        session.memory['memory_u8'] = 'uint8_t';
        var offset = instr.parsed.opd[instr.parsed.opd.length - 1];
        var pointer = current.stack.pop();
        var register = current.stack.pop();
        var bits = instr.parsed.mnem.match(/\d+/) || ["32"];
        bits = parseInt(bits[0]);
        if (offset != '0') {
            pointer += ' + ' + (parseInt(offset) / (bits / 8)).toString();
        }
        return Base.write_memory('memory_u8 + ' + pointer, register.value(), bits, false);
    };

    var wasm_parse = function(asm) {
        asm = asm.trim().replace(/\s+/g, ' ').replace(/\//g, ' ');
        var type = asm.match(/[if]\d\d\./);
        if (type) {
            type = type[0];
            asm = asm.replace(/[if]\d\d\./, '');
        }
        asm = asm.split(' ');

        return {
            type: type || 'i32',
            mnem: asm.shift(),
            opd: asm
        };
    };

    var wasm_opcodes = {
        eq: _conditional,
        ne: _conditional,
        eqz: _conditional_zero,
        nez: _conditional_zero,
        gt_s: _conditional,
        gt_u: _conditional,
        ge_s: _conditional,
        ge_u: _conditional,
        lt_s: _conditional,
        lt_u: _conditional,
        le_s: _conditional,
        le_u: _conditional,
        gt: _conditional,
        ge: _conditional,
        lt: _conditional,
        le: _conditional,
        load: _common_load,
        load8_s: _common_load,
        load8_u: _common_load,
        load16_s: _common_load,
        load16_u: _common_load,
        store: _common_store,
        store8: _common_store,
        store16: _common_store,
        store32: _common_store,
        const: function(instr, current, session) {
            current.stack.push(new Const(instr.parsed.type, instr.parsed.opd[0]));
        },
        add: function(instr, current, session) {
            return _math(instr, current, session, Base.add);
        },
        and: function(instr, current, session) {
            return _math(instr, current, session, Base.and);
        },
        div_s: function(instr, current, session) {
            return _math(instr, current, session, Base.divide);
        },
        div_u: function(instr, current, session) {
            return _math(instr, current, session, Base.divide, true);
        },
        extend_s: function(instr, current, session) {},
        extend_u: function(instr, current, session) {},
        mul: function(instr, current, session) {
            return _math(instr, current, session, Base.multiply);
        },
        or: function(instr, current, session) {
            return _math(instr, current, session, Base.or);
        },
        reinterpret: function(instr, current, session) {},
        rem_s: function(instr, current, session) {
            return _math(instr, current, session, Base.module);
        },
        rem_u: function(instr, current, session) {
            return _math(instr, current, session, Base.module, true);
        },
        shl: function(instr, current, session) {
            return _math(instr, current, session, Base.shift_left);
        },
        shr_s: function(instr, current, session) {
            return _math(instr, current, session, Base.shift_right);
        },
        shr_u: function(instr, current, session) {
            return _math(instr, current, session, Base.shift_right, true);
        },
        sub: function(instr, current, session) {
            return _math(instr, current, session, Base.subtract);
        },
        wrap: function(instr, current, session) {},
        trunc_s: function(instr, current, session) {},
        trunc_u: function(instr, current, session) {},
        xor: function(instr, current, session) {
            return _math(instr, current, session, Base.xor);
        },
        get_global: function(instr, current, session) {
            var key = instr.parsed.opd[0];
            if (!session.globals[key]) {
                session.globals[key] = new Global(instr.parsed.type);
            }
            current.stack.push(session.globals[key]);
        },
        set_global: function(instr, current, session) {
            var key = instr.parsed.opd[0];
            var value = current.stack.pop() || 0;
            if (!session.globals[key]) {
                session.globals[key] = new Global(instr.parsed.type);
            }
            return Base.assign(session.globals[key].value(), value.value());
        },
        get_local: function(instr, current, session) {
            var key = instr.parsed.opd[0];
            if (!current.locals[key]) {
                current.locals[key] = new Argv(instr.parsed.type);
            }
            current.stack.push(current.locals[key]);
        },
        set_local: function(instr, current, session) {
            var key = instr.parsed.opd[0];
            var value = current.stack.pop() || 0;
            if (!current.locals[key]) {
                current.locals[key] = new Local(instr.parsed.type);
            }
            return Base.assign(current.locals[key].value(), value.value());
        },
        tee_local: function(instr, current, session) {
            var key = instr.parsed.opd[0];
            var value = current.stack.pop() || 0;
            if (!current.locals[key]) {
                current.locals[key] = new Local(instr.parsed.type);
            }
            return Base.assign(current.locals[key].value(), value.value());
        },
        drop: function(instr, current, session) {
            current.stack.pop().value();
        },
        call: function(instr, current, session) {
            var id = parseInt(instr.parsed.opd[0] || '0');
            var name = 'unknown_' + id;
            if (session.routines[id]) {
                name = session.routines[id].name
            }
            return Base.call(Extra.replace.call(name));
        },
        return: function(instr, current, session) {
            var value = current.stack.pop();
            if (value) {
                current.returns = _type(value)
            }
            return Base.return(value ? value.value() : null);
        },
        'if': function(instr, current, session) {
            current.scopestack.push({
                name: 'if',
                data: current.code.length
            });
            return Base.if(current.stack.pop().value());
        },
        br_if: function(instr, current, session) {
            var id = parseInt(instr.parsed.opd[0] || '0');
            var last = current.scopestack.length - 1;
            var label = null;
            if (id > 0) {
                if (current.scopestack[last - id].name == 'block') {
                    label = 'label_' + _counters.labels;
                    _counters.labels++;
                    current.scopestack[last - id].label = label;
                } else {
                    var pos = current.scopestack[last - id].data;
                    if (current.code[pos].label) {
                        label = current.code[pos].label;
                    } else {
                        label = 'label_' + _counters.labels;
                        _counters.labels++;
                        current.code[pos].label = label;
                    }
                }
            }
            if (id == 0) {
                return Base.if_branch(current.stack.pop().value(), current.scopestack[last].name == 'block' ? Base.break() : Base.continue());
            }
            return Base.if_branch(current.stack.pop().value(), Base.goto(label));
        },
        'else': function(instr, current, session) {
            var p = current.scopestack.pop();
            instr.label = p ? p.label : null;
            current.scopestack.push({
                name: 'else',
                data: current.code.length
            });
            return Base.else();
        },
        block: function(instr, current, session) {
            current.scopestack.push({
                name: 'block',
                data: current.code.length
            });
            return Base.while();
        },
        loop: function(instr, current, session) {
            current.scopestack.push({
                name: 'while',
                data: current.code.length
            });
            return Base.while();
        },
        end: function(instr, current, session) {
            current.analyzed = current.scopestack.length < 1;
            var p = current.scopestack.pop();
            var o = Base.end();
            o.label = p ? p.label : null;
            return o;
        },
        br: function(instr, current, session) {
            var id = parseInt(instr.parsed.opd[0] || '0');
            var last = current.scopestack.length - 1;
            var label = null;
            if (id > 0) {
                if (current.scopestack[last - id].name == 'block') {
                    label = 'label_' + _counters.labels;
                    _counters.labels++;
                    current.scopestack[last - id].label = label;
                } else {
                    var pos = current.scopestack[last - id].data;
                    if (current.code[pos].label) {
                        label = current.code[pos].label;
                    } else {
                        label = 'label_' + _counters.labels;
                        _counters.labels++;
                        current.code[pos].label = label;
                    }
                }
            }
            if (id == 0) {
                return current.scopestack[last].name == 'block' ? Base.break() : Base.continue();
            }
            return Base.goto(label);
        },
        nop: function(instr, current, session) {},
        invalid: function(instr, current, session) {},
    };


    return function(session) {
        for (var j = 0; j < session.routines.length; j++) {
            var current = session.routines[j];
            var instructions = current.instructions;
            if (session.to_show && current.name != session.to_show) continue;
            _counters.args = 0; // arg counter always to zero
            _counters.locals = 0;
            _counters.labels = 0;
            for (var i = 0; i < instructions.length; i++) {
                var instr = instructions[i];
                instr.parsed = wasm_parse(instr.assembly);
                if (!instr.parsed.mnem || instr.parsed.mnem.length < 1) {
                    Global.warning("invalid mnem. stopping instruction analysis.");
                    break;
                }
                var fcn = wasm_opcodes[instr.parsed.mnem];
                // console.log(current.name, instr.location.toString(16), instr.assembly);
                var c_code = fcn ? fcn(instr, current, session) : null;
                if (c_code) {
                    // console.log('>>', c_code.toString())
                    current.code.push(c_code);
                }
                if (current.analyzed) {
                    break;
                }
            }
            session.routines[j] = current;
        }
    };
})();