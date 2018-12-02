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
    var Block = require('libdec/core/block');
    var Scope = require('libdec/core/scope');
    var Strings = require('libdec/core/strings');
    var Symbols = require('libdec/core/symbols');
    var Functions = require('libdec/core/functions');
    var Instruction = require('libdec/core/instruction');
    var ControlFlow = require('libdec/core/controlflow');
    var Extra = require('libdec/core/extra');
    var VM = require('libdec/core/vm');

    /**
     * Is the function that is called after the opcode analisys.
     * Essentially analyze the flows and allows the call of
     * the `postanalisys` function that has to be set in the architecture.
     * @param  {Object} session      - Current session object.
     * @param  {Object} arch         - Current architecture object
     * @param  {Object} arch_context - Current architecture context object.
     */
    var _post_analysis = function(session, arch, arch_context) {
        /*
        ControlFlow(session);
        if (arch.postanalisys) {
            arch.postanalisys(session.instructions, arch_context);
        }
        var routine = new Scope.routine(session.instructions[0].location, {
            returns: arch.returns(arch_context) || 'void',
            name: session.routine_name,
            args: arch.arguments(arch_context) || [],
            locals: arch.localvars(arch_context) || [],
            globals: arch.globalvars(arch_context) || []
        });
        session.routine = routine;
        */
    };

    /**
     * Is the function that is called before the opcode analisys.
     * Calls `preanalisys` function that has to be set in the architecture
     * and copies the instruction into the first block and updates the bounds of this.
     * @param  {Object} session      - Current session object.
     * @param  {Object} arch         - Current architecture object
     * @param  {Object} arch_context - Current architecture context object.
     */
    var _pre_analysis = function(session, arch, arch_context) {};

    /**
     * Most important of the analisys block: it analize the architecture opcodes. 
     * @param  {Object} session      - Current session object.
     * @param  {Object} arch         - Current architecture object
     * @param  {Object} arch_context - Current architecture context object.
     */
    var _decompile = function(session, arch, arch_context) {
        VM(session);
    };

    /**
     * Prints the current session into the screen.
     * @param  {Object} session - Current session object.
     */
    var _print = function(session) {
        var t = Global.printer.theme;
        var asm_header = '; assembly';
        console.log(Global.context.identfy(asm_header.length, t.comment(asm_header)) + t.comment('/* r2dec pseudo C output */'));

        Global.context.printMacros();
        Global.context.printDependencies();
        session.print();
        while (Global.context.ident.length > 0) {
            Global.context.identOut();
            console.log(Global.context.identfy() + '}');
        }
    };

    var _analyze_locals = function(locals) {
        var a = Global.printer.auto;
        var o = {
            locals: [],
            args: []
        };
        for (var key in locals) {
            if (locals[key].value().indexOf('arg_') == 0) {
                o.args.push(a(locals[key].define()));
            } else {
                o.locals.push(a(locals[key].define()));
            }
        }
        return o;
    };

    var _routine = function(name) {
        this.xrefs = [];
        this.locals = {};
        this.stack = [];
        this.scopestack = [];
        this.code = [];
        this.instructions = [];
        this.name = name;
        this.scopes = [];
        this.returns = 'void';
        this.analyzed = false;
        this.print = function() {
            var vars = _analyze_locals(this.locals);
            var t = Global.printer.theme;
            console.log(t.types(this.returns) + ' ' + t.callname(Extra.replace.call(this.name)) + ' (' + vars.args.join(', ') + ') {');
            Global.context.identIn();
            for (var i = 0; i < vars.locals.length; i++) {
                console.log(Global.context.identfy() + vars.locals[i] + ';');
            }
            if (vars.locals.length > 0) console.log();

            for (var i = 0; i < this.code.length; i++) {
                var to_print = this.code[i];
                var end = to_print.exit_scope || to_print.enter_scope ? '' : ';';
                if (to_print.exit_scope) {
                    Global.context.identOut();
                }
                if (to_print.label && !to_print.exit_scope && !to_print.enter_scope) {
                    console.log(to_print.label);
                }
                console.log(Global.context.identfy() + to_print + end);
                if (to_print.enter_scope) {
                    Global.context.identIn();
                }
                if (to_print.label && (to_print.exit_scope || to_print.enter_scope)) {
                    console.log(to_print.label);
                }
            }
        };
    }

    /**
     * Defines the structure that will be used as session for analisys steps.
     * @param  {Object} data - Data to be analized.
     * @param  {Object} arch - Current architecture object
     */
    var _session = function(data) {
        var instructions = [];
        var symbols = new Symbols(data.symbols);
        var max_length = 0;
        var max_address = 8;
        var routines = [];
        Global.evars
        var old_symbl = null;
        for (var i = 0; i < data.code.length; i++) {
            var b = data.code[i];
            if (!b) continue
            if (max_length < b.opcode.length) {
                max_length = b.opcode.length;
            }
            var ins = new Instruction(b);
            if (max_address < ins.location.toString(16)) {
                max_address = ins.location.toString(16).length;
            }
            var symbl = symbols.search(ins.location);
            if (symbl) {
                if (old_symbl) {
                    routines[routines.length - 1].instructions = instructions;
                }
                instructions = []
                old_symbl = symbl;
                routines.push(new _routine(symbl));
            }
            instructions.push(ins);
        }
        if (old_symbl) {
            routines[routines.length - 1].instructions = instructions;
        }
        Global.context.identAsmSet(max_length + max_address);
        this.to_show = Global.evars.honor.all ? null : (data.routine == 'entry0' ? routines[0].name : data.routine.replace(/^sym\./, ''));
        this.routines = routines;
        this.globals = {};
        this.memory = {};
        this.print = function() {
            for (var key in this.memory) {
                console.log(Global.printer.theme.types(this.memory[key]) + " " + key + '[];');
            }
            for (var key in this.globals) {
                console.log(Global.printer.auto(this.globals[key].define()) + ';');
            }
            console.log();

            for (var i = 0; i < this.routines.length; i++) {
                if (this.to_show && this.routines[i].name != this.to_show) continue;
                this.routines[i].print();
                console.log();
            }
        };
    };

    return {
        decompile: _decompile,
        session: _session,
        analysis: {
            pre: _pre_analysis,
            post: _post_analysis
        },
        print: _print,
    };
})();