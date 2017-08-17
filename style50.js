define(function(require, exports, module) {
    main.consumes = [
        "dialog.error","Panel","proc","save","settings","tabManager","ui"
    ];
    main.provides = ["harvard.cs50.style"];
    return main;

    function main(options, imports, register) {
        var Panel = imports.Panel;
        var proc = imports.proc;
        var save = imports.save;
        var settings = imports.settings;
        var tabManager = imports.tabManager;
        var ui = imports.ui;
        
        var BAD_RESULT_MSG = "Style50 returned something unexpected";
        var CRASH_ERR_MSG = "Style50 crashed";
        var NO_RESULT_MSG = "Style50 didn't return a result";
        var RUNTIME_ERR_MSG = "Style50 returned an error message";
        var UNSUPPORTED_ERR_MSG = "Style50 does not support this file type";
        
        /***** Initialization *****/
        var style50_panel = new Panel("style50", main.consumes, {
            index    : 100, // order in the vertical bar
            width    : 250, // window width when open
            caption  : "Style50", // name in the vertical bar
            minWidth : 200,  // ?? doesn't seem to be enforced
            where    : "right"
        });
        
        var emit = style50_panel.getEmitter();
        
        //runs when c9 is started/package is loaded
        function load() {
            
            /////
            // Set styling for the plugin via CSS
            /////
            ui.insertCss(require("text!./style50.css"), options.staticPrefix, style50_panel);
            
            //match plugin's code display to IDE's code display
            var font_family = settings.get("user/ace/@fontFamily");
            var font_text = settings.get("user/ace/@fontSize") + "px";
            ui.setStyleRule("#style50","font-family",font_family);
            ui.setStyleRule("#style50","font-size",font_text);
            
            /////
            // Set event handlers
            /////
            
            //all open tabs should talk to us when given focus
            tabManager.once("ready", function() {
                tabManager.on("focus",function(e){
                    if (!style50_panel.active){
                        return;
                    }
                    emit("draw",{
                        aml:style50_panel.aml,
                        html:style50_panel.aml.$int
                    });
                },style50_panel);
            });
            
            //when a user saves a file, redraw the style50 pane
            save.on("afterSave",function(e){
                emit("draw",{aml:style50_panel.aml,html:style50_panel.aml.$int});
            },style50_panel);
            
            //update our font size and shape when those settings change
            settings.on("user/ace/@fontSize",function(new_size){
                var font_text = new_size + "px";
                ui.setStyleRule("#style50","font-size",font_text);
            },style50_panel);
            
            settings.on("user/ace/@fontFamily",function(new_family_text){
                ui.setStyleRule("#style50","font-family",new_family_text);
            },style50_panel);
        }
        
        /***** Methods and Helper Functions*****/
        
        //helper to run the style50 command line tool and render output
        draw_pane = function(e,filepath){
            //clear the window
            e.html.innerHTML = "";
            
            //run the CLI and handle results
            proc.spawn(
                "style50",
                { args: ["-o","json", filepath] },  //runs in /var/c9sdk
                function(err, process) {
                    if (err){
                        grave_error(e, CRASH_ERR_MSG);
                        throw err;
                    }
                    
                    var error_accumulation=[];
                    var out_accumulation=[];
                    
                    // accumulate responses utill the stream ends
                    process.stdout.on("data", function(chunk) {
                        out_accumulation.push(chunk);
                    });
                    
                    process.stderr.on("data",function(chunk){
                        error_accumulation.push(chunk);
                    });
                    
                    // if the CL tool errors
                    process.stderr.on("end",function(chunk){
                        
                        //stitch together the error and display it
                        var full_error=error_accumulation.join('');
                        
                        if (full_error){
                            grave_error(e, RUNTIME_ERR_MSG);
                            console.log("error in style50:");
                            console.log(full_error);
                            return;
                        }
                    });
                    
                    // if the CL tool works
                    process.stdout.on("end", function(chunk) {
                        
                        //stitch the various chunks together
                        var full_output=out_accumulation.join('');
                        
                        if (!full_output){
                            grave_error(e, NO_RESULT_MSG);
                            return;
                        }
                        
                        // bad output
                        var style50_dict = JSON.parse(full_output);
                        if (!style50_dict[filepath]){
                            grave_error(e, BAD_RESULT_MSG);
                            return;
                        }
                        
                        // handled internal error (e.g. couldn't find file)
                        var error_msg = style50_dict[filepath].error;
                        if (error_msg){
                            html_error(e,"Style50: " + error_msg);
                            return;
                        }
                        
                        // missing fields
                        var diff_html = style50_dict[filepath].diff;
                        var percent_score = style50_dict[filepath].score;
                        if (!diff_html || ! percent_score){
                            html_error(e, BAD_RESULT_MSG);
                        }
                        
                        // process results
                        
                        // if code style is perfect, congratualte the user and quit
                        if (percent_score === 1){
                            e.html.innerHTML = "<div id = 'style50_perfect'>" + "<br>" + "Your code is styled beautifully!!" + "</div>";
                            return;
                        }
                        
                        //Otherwise, give info on the number of incorrect lines and display the diff
                        var line_array = diff_html.split("\n");
                        var nonempty_insert = /<ins>.+<\/ins>/;
                        var nonempty_delete = /<del>.+<\/del>/;
                        var bad_line_count = line_array.reduce(function(count,cur_line){
                            return count + (nonempty_insert.test(cur_line) || nonempty_delete.test(cur_line));
                        },0);
                        
                        score_html = "<div>You have " + bad_line_count + " lines styled incorrectly";
                        
                        e.html.innerHTML = "<div id = 'style50'>" + score_html + diff_html + "</div>";
                    });
                }
            );
        };
        
        //helper to diplay an error message in the panel
        function html_error(e, message){
            e.html.innerHTML = "<div id = 'style50_error'>" + message + "</div>";
        }
        
        //helper to diplay a (serious) error message as a pop-in
        function grave_error(e, message){
            var showError = imports["dialog.error"].show;
            html_error(e, message);
            return showError(message,3000);
        }
        
        /***** Lifecycle *****/
        //load and unload
        style50_panel.on("load", function() {
            load();
        });
        
        style50_panel.on("unload", function() {
            
        });
        
        style50_panel.on("show", function() {
            emit("draw",{
                aml:style50_panel.aml,
                html:style50_panel.aml.$int
            });
        });
        
        //draw the panel by getting focused file's path/extension and calling the draw helper
        style50_panel.on("draw", function(e) {
            // if (!style50_panel.active){
            //     return;
            // }
            var cur_tab = tabManager.focussedTab;
            
            //if no tabs are open
            if (!cur_tab){
                return;
            }
            
            //if the tab is a terminal, preferences page, or other item without a filepath
            var filepath = cur_tab.path;
            if (!filepath){
                return;
            }
            
            var fullpath = "/home/ubuntu/workspace" + filepath;
            
            var extention = filepath.split('.').pop();
            if (extention !== "c" && extention !== "js" && extention !== "py" && extention !== "cpp" && extention !== "java"){
                html_error(e, UNSUPPORTED_ERR_MSG);
                return;
            }
            
            draw_pane(e,fullpath);
        });
        
        /***** Register and define API *****/
        style50_panel.freezePublicAPI({
            
        });
        
        register(null, {
            "harvard.cs50.style": style50_panel
        });
    }
});