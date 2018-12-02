/* radare - LGPL - Copyright 2018 - deroad */

#include <r_types.h>
#include <r_lib.h>
#include <r_cmd.h>
#include <r_core.h>
#include <r_cons.h>
#include <string.h>
#include <r_anal.h>
#include <duktape.h>
#include <duk_console.h>

#undef R_API
#define R_API static
#undef R_IPI
#define R_IPI static
#define SETDESC(x,y) r_config_node_desc (x,y)
#define SETPREF(x,y,z) SETDESC (r_config_set (cfg,x,y), z)

/* for compatibility. */
#ifndef R2_HOME_DATADIR
#define R2_HOME_DATADIR R2_HOMEDIR
#endif

static RCore *core_link = 0;

static char* r2dec_read_file(const char* file) {
	if (!file) {
		return 0;
	}
	char *r2dec_home;
	char *env = r_sys_getenv ("R2DEC_WASM_HOME");
	if (env) {
		r2dec_home = env;
	} else {
		r2dec_home = r_str_home (R2_HOME_DATADIR R_SYS_DIR
			"r2pm" R_SYS_DIR "git" R_SYS_DIR "r2dec-wasm");
	}
	int len = 0;
	if (!r2dec_home) {
		return 0;
	}
	char *filepath = r_str_newf ("%s"R_SYS_DIR"%s", r2dec_home, file);
	free (r2dec_home);
	char* text = r_file_slurp (filepath, &len);
	if (text && len > 0) {
		free (filepath);
		return text;
	}
	free (filepath);
	return 0;
}

static duk_ret_t duk_r2cmd(duk_context *ctx) {
	if (duk_is_string (ctx, 0)) {
		char* output = r_core_cmd_str (core_link, duk_safe_to_string (ctx, 0));
		duk_push_string (ctx, output);
		free (output);
		return 1;
	}
	return DUK_RET_TYPE_ERROR;
}

static duk_ret_t duk_internal_load(duk_context *ctx) {
	if (duk_is_string (ctx, 0)) {
		const char* fullname = duk_safe_to_string (ctx, 0);
		char* text = r2dec_read_file (fullname);
		if (text) {
			duk_push_string (ctx, text);
			free (text);
		} else {
			printf("Error: '%s' not found.\n", fullname);
			return DUK_RET_TYPE_ERROR;
		}
		return 1;
	}
	return DUK_RET_TYPE_ERROR;
}

static duk_ret_t duk_internal_require(duk_context *ctx) {
	char fullname[256];
	if (duk_is_string (ctx, 0)) {
		snprintf (fullname, sizeof(fullname), "%s.js", duk_safe_to_string (ctx, 0));
		char* text = r2dec_read_file (fullname);
		if (text) {
			duk_push_string (ctx, text);
			free (text);
		} else {
			printf("Error: '%s' not found.\n", fullname);
			return DUK_RET_TYPE_ERROR;
		}
		return 1;
	}
	return DUK_RET_TYPE_ERROR;
}

static void duk_r2_init(duk_context* ctx) {
	duk_push_c_function (ctx, duk_internal_require, 1);
	duk_put_global_string (ctx, "___internal_require");
	duk_push_c_function (ctx, duk_internal_load, 1);
	duk_put_global_string (ctx, "___internal_load");
	duk_push_c_function (ctx, duk_r2cmd, 1);
	duk_put_global_string (ctx, "r2cmd");
}

static void duk_eval_file(duk_context* ctx, const char* file) {
	char* text = r2dec_read_file (file);
	if (text) {
		duk_eval_string_noresult (ctx, text);
		free (text);
	}
}

static void r2dec_fatal_function (void *udata, const char *msg) {
    fprintf (stderr, "*** FATAL ERROR: %s\n", (msg ? msg : "no message"));
    fflush (stderr);
    abort ();
}

static void duk_r2dec(RCore *core, const char *input) {
	char args[1024] = {0};
	core_link = core;
	duk_context *ctx = duk_create_heap (0, 0, 0, 0, r2dec_fatal_function);
	duk_console_init (ctx, 0);
	duk_r2_init (ctx);
	duk_eval_file (ctx, "require.js");
	duk_eval_file (ctx, "r2dec-duk.js");
	if (*input) {
		snprintf (args, sizeof(args), "if(typeof r2dec_main == 'function'){r2dec_main(\"%s\".split(/\\s+/));}else{console.log('Fatal error. Cannot use R2_HOME_DATADIR.');}", input);
	} else {
		snprintf (args, sizeof(args), "if(typeof r2dec_main == 'function'){r2dec_main([]);}else{console.log('Fatal error. Cannot use R2_HOME_DATADIR.');}");
	}
	duk_eval_string_noresult (ctx, args);
	duk_destroy_heap (ctx);
	core_link = 0;
}

static void usage(void) {
	r_cons_printf ("Usage: pdw [args] - core plugin for r2dec\n");
	r_cons_printf (" pdw   - decompile current function\n");
	r_cons_printf (" pdw?  - show this help\n");
	r_cons_printf (" pdwa  - decompile all the code segment\n");
	r_cons_printf (" pdwi  - generates the issue data\n");
	r_cons_printf (" pdwu  - install/upgrade r2dec via r2pm\n");
	r_cons_printf ("Evaluable Variables:\n");
	r_cons_printf (" pdw.casts   - if false, hides all casts in the pseudo code.\n");
	r_cons_printf (" pdw.theme   - defines the color theme to be used on r2dec.\n");
	r_cons_printf ("Environment\n");
	r_cons_printf (" R2DEC_WASM_HOME  defaults to the root directory of the r2dec repo\n");

}

static void _cmd_pdw(RCore *core, const char *input) {
	switch (*input) {
	case '\0':
		duk_r2dec(core, input);
		break;
	case ' ':
		duk_r2dec(core, input);
		break;
	case 'a':
		duk_r2dec(core, "--all");
		break;
	case 'i':
		duk_r2dec(core, "--issue");
		break;
	case 'u':
		// update
		r_core_cmd0 (core, "!r2pm -ci r2dec-wasm");
		break;
	case '?':
	default:
		usage();
		break;
	}
}

static void custom_config(bool *p, const char* input) {
	if (strchr (input, '=')) {
		if(strchr (input, 't')) {
			*p = true;
		} else if(strchr (input, 'f')) {
			*p = false;
		}
	} else {
		r_cons_printf ("%s\n", ((*p) ? "true" : "false"));
	}
}

static int r_cmd_pdw(void *user, const char *input) {
	RCore *core = (RCore *) user;
	if (!strncmp (input, "e cmd.pdc", 9)) {
		if (strchr (input, '=') && strchr (input, '?')) {
			r_cons_printf ("r2dec-wasm\n");
			return false;
		}
	}
	if (!strncmp (input, "pdw", 3)) {
		_cmd_pdw (core, input + 3);
		return true;
	}
	return false;
}

int r_cmd_pdw_init(void *user, const char *cmd) {
	RCmd *rcmd = (RCmd*) user;
	RCore *core = (RCore *) rcmd->data;
	RConfig *cfg = core->config;
	r_config_lock (cfg, false);
	SETPREF("pdw.casts", "false", "if false, hides all casts in the pseudo code.");
	SETPREF("pdw.theme", "default", "defines the color theme to be used on r2dec.");
	r_config_lock (cfg, true);

	// autocomplete here..
	RCoreAutocomplete *pdw = r_core_autocomplete_add (core->autocomplete, "pdw", R_CORE_AUTOCMPLT_DFLT, true);
	r_core_autocomplete_add (core->autocomplete, "pdwa", R_CORE_AUTOCMPLT_DFLT, true);
	r_core_autocomplete_add (core->autocomplete, "pdwi", R_CORE_AUTOCMPLT_DFLT, true);
	r_core_autocomplete_add (core->autocomplete, "pdwu", R_CORE_AUTOCMPLT_DFLT, true);
	r_core_autocomplete_add (pdw, "--all", R_CORE_AUTOCMPLT_OPTN, true);
	r_core_autocomplete_add (pdw, "--casts", R_CORE_AUTOCMPLT_OPTN, true);
	r_core_autocomplete_add (pdw, "--colors", R_CORE_AUTOCMPLT_OPTN, true);
	r_core_autocomplete_add (pdw, "--debug", R_CORE_AUTOCMPLT_OPTN, true);
	r_core_autocomplete_add (pdw, "--html", R_CORE_AUTOCMPLT_OPTN, true);
	r_core_autocomplete_add (pdw, "--issue", R_CORE_AUTOCMPLT_OPTN, true);
	r_core_autocomplete_add (pdw, "--paddr", R_CORE_AUTOCMPLT_OPTN, true);
	return true;
}

RCorePlugin r_core_plugin_r2dec_wasm = {
	.name = "r2dec-wasm",
	.desc = "WASM pseudo-C decompiler for radare2",
	.license = "Apache",
	.call = r_cmd_pdw,
	.init = r_cmd_pdw_init
};

#ifdef _MSC_VER
#define _R_API __declspec(dllexport)
#else
#define _R_API
#endif

#ifndef CORELIB
_R_API RLibStruct radare_plugin = {
	.type = R_LIB_TYPE_CORE,
	.data = &r_core_plugin_r2dec_wasm,
	.version = R2_VERSION
};
#endif
