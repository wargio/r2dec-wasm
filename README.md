[![Build Status](https://travis-ci.org/wargio/r2dec-wasm.svg?branch=master)](https://travis-ci.org/wargio/r2dec-wasm) [![CodeFactor](https://www.codefactor.io/repository/github/wargio/r2dec-wasm/badge)](https://www.codefactor.io/repository/github/wargio/r2dec-wasm)

r2dec-wasm
==========

Converts WASM to pseudo-C code (extends r2dec).

# Software Requirements

Requires radare2 version 3.1.x or newer.

# Install

Follow the following steps to install r2dec via r2pm

### *nix users (Linux/OSX/etc..):

    r2pm init
    r2pm install r2dec-wasm

### Windows users only:

 - clone
 - run `make -C p` from inside the `r2dec-wasm` folder

done

# Usage

* open with radare2 your file
* analize the function you want to disassemble (`af`)
* run the plugin via `pdw`
* done.

# Arguments

```
[0x00000000]> pdw?
Usage: pdw [args] - core plugin for r2dec-wasm
 pdw   - decompile current function
 pdw?  - show this help
 pdwu  - install/upgrade r2dec via r2pm
 pdwi  - generates the issue data
Environment
 R2DEC_HOME  defaults to the root directory of the r2dec repo
[0x00000000]> pdw --help

r2dec-wasm [options]
       --help       | this help message
       --colors     | enables syntax colors
       --casts      | shows all casts in the pseudo code
       --debug      | do not catch exceptions
       --html       | outputs html data instead of text
       --issue      | generates the json used for the test suite
```

# Radare2 Evaluable vars

You can use these in your `.radare2rc` file.

```
pdw.casts           | if false, hides all casts in the pseudo code.
pdw.paddr           | if true, all xrefs uses physical addresses compare.
pdw.theme           | defines the color theme to be used on r2dec-wasm.
e scr.html          | outputs html data instead of text.
e scr.color         | enables syntax colors.
```

# Report an Issue

* open with radare2 your file
* analize the function you want to disassemble (`af`)
* give the data to the plugin via `pdwi` or `pdw --issue`
* insert the JSON returned by the previous command into the issue (you can also upload the output)
* done.

# Developing on r2dec-wasm

[Read DEVELOPERS.md](https://github.com/wargio/r2dec-wasm/blob/master/DEVELOPERS.md)
