define(function(require, exports, module) {
    main.consumes = [
        "Panel", "c9", "panels","ui","layout","proc","ace","tabManager","save","settings"
    ];
    main.provides = ["style50"];
    return main;

    function main(options, imports, register) {
        var Panel = imports.Panel;
        var ui = imports.ui;
        var proc = imports.proc;
        var tabManager = imports.tabManager;
        var save = imports.save;
        var settings = imports.settings;
        
        /***** Initialization *****/
        var style50_panel = new Panel("style50", main.consumes, {
            index    : 100, //order in the vertical bar
            width    : 250, //window width when open
            caption  : "Style50", //name in the vertical bar
            minWidth : 200,  //??
            where    : "right"
        });
        
        var emit = style50_panel.getEmitter();
        
        //runs when c9 is started/package is loaded
        function load() {
            // style50_panel.setCommand({
            //     name    : "coolpanel",
            //     hint    : "being cool",
            //     bindKey : { mac: "Command-H", win: "Ctrl-H" }
            // });
            
            /////
            // Set styling for the plugin via CSS
            /////
            
            //color scheme for the insertions and deletions
            ui.insertCss("\
                del {background-color: OrangeRed;  text-decoration: none;}\
                ins {background-color: SpringGreen; text-decoration: none;}"
            , options.staticPrefix, style50_panel);
            
            //match plugin's code display to IDE's code display
            var font_family=settings.get("user/ace/@fontFamily");
            var font_text=set_font(settings.get("user/ace/@fontSize"));
            ui.insertCss("#style50 {\
                font-family:" + font_family + ";\
                font-size:" + font_text +";\
            }", options.staticPrefix, style50_panel);
            
            //enable scrolling and disable selection (and thus copy/paste) for the plugin
            ui.insertCss("#style50 {\
                overflow-y: scroll; height: 100%;\
                user-select: none;\
                -ms-user-select: none;\
                -moz-user-select: none;\
                -webkit-user-select: none;\
                -webkit-touch-callout: none;\
            }", options.staticPrefix, style50_panel);
            
            //styling for the success/perfect score message
            ui.insertCss("#style50_perfect {\
                text-align: center;\
                padding: 70px 0;\
            }", options.staticPrefix, style50_panel);
            
            //styling for the error messages
            ui.insertCss("\
                #style50_error {text-align: center;\
                                 padding: 70px 0;\
                }", options.staticPrefix, style50_panel);
            
            
            /////
            // Set event handlers
            /////
            
            //all open tabs should talk when given focus
            tabManager.once("ready", function() {
                tabManager.on("focus",function(e){
                    if (!style50_panel.active){
                        return;
                    }
                    emit("draw",{aml:style50_panel.aml,html:style50_panel.aml.$int});
                },style50_panel);
            });
            
            //when a user saves a file, redraw the style50 pane
            save.on("afterSave",function(e){
                emit("draw",{aml:style50_panel.aml,html:style50_panel.aml.$int});
            },style50_panel);
            
            //update our font size and shape when the setting changes
            settings.on("user/ace/@fontSize",function(e){
                font_text=set_font(settings.get("user/ace/@fontSize"));
                ui.insertCss("#style50 {font-size:" + font_text +";}", options.staticPrefix, style50_panel);
            },style50_panel);
            
            settings.on("user/ace/@fontFamily",function(e){
                font_family=set_font(settings.get("user/ace/@fontSize"));
                ui.insertCss("#style50 {font-size:" + font_family +";}", options.staticPrefix, style50_panel);
            },style50_panel);
        }
        
        /***** Methods and Helper Functions*****/
        //helper to run the style50 command line tool and render output
        draw_pane=function(e,filepath){
            //clear the window
            e.html.innerHTML="";
            
            //run the CLI and handle results
            proc.spawn(
                "style50",
                { args: ["-o","json", filepath] },  //runs in /var/c9sdk
                function(err, process) {
                    if (err) throw err;
                    
                    //if the CL tool errors
                    process.stderr.on("data",function(chunk){
                        console.log("error in style50:");
                        console.log(chunk);
                        draw_error(e);
                        return;
                    });
                    
                    //if the CL tool works
                    process.stdout.on("data", function(chunk) {
                        
                        //unpack the JSON output
                        var style50_dict=JSON.parse(chunk);
                        if (!style50_dict[filepath]){
                            draw_error(e);
                            return;
                        }
                        var diff_html=style50_dict[filepath].diff;
                        var percent_score=style50_dict[filepath].score;
                        
                        //if code style is perfect, congratualte the user and quit
                        if (percent_score===1){
                            e.html.innerHTML="<div id='style50_perfect'>"+ "<br>"+ "Your code is styled beautifully!!" +"</div>";
                            return;
                        }
                        
                        //Otherwise, give info on the number of incorrect lines and display the diff
                        var line_array=diff_html.split("\n");
                        var nonempty_insert=/<ins>.+<\/ins>/;
                        var nonempty_delete=/<del>.+<\/del>/;
                        var bad_line_count=line_array.reduce(function(count,cur_line){
                            return count + (nonempty_insert.test(cur_line) || nonempty_delete.test(cur_line));
                        },0);
                        
                        score_html="<div>You have " + bad_line_count + " lines styled incorrectly";
                        
                        e.html.innerHTML="<div id='style50'>"+ score_html + diff_html +"</div>";
                    });
                }
            );
        };
        
        //helpers to diplay an error message
        draw_unsupported_error=function(e){
            e.html.innerHTML="<div id='style50_error'>"+"Style50 does not support this file type"+"</div>";
        };
        draw_error=function(e){
            e.html.innerHTML="<div id='style50_error'>"+"Style50 encountered an error";+"</div>";
        };
        
        //sets mapping between c9's listed font size and the CSS font attribute
        set_font=function(font_size){
            percent=7*(font_size-12)+100;
            return ""+percent+"%";
        };
        
        /***** Lifecycle *****/
        //load and unload
        style50_panel.on("load", function() {
            load();
        });
        style50_panel.on("unload", function() {
            
        });
        
        //draw the panel by getting focused file's path/extension and calling the draw helper
        style50_panel.on("draw", function(e) {
            // if (!style50_panel.active){
            //     return;
            // }
            var cur_tab=tabManager.focussedTab;
            
            var filepath=cur_tab.path;
            if (!filepath){
                return;
            }
            var fullpath="/home/ubuntu/workspace"+filepath;
            
            var extention=filepath.split('.').pop();
            if (extention !== "c" && extention !== "js" && extention !== "py" && extention !== "cpp" && extention !== "java"){
                draw_unsupported_error(e);
                return;
            }
            
            draw_pane(e,fullpath);
        });
        
        /***** Register and define API *****/
        style50_panel.freezePublicAPI({
            
        });
        
        register(null, {
            "style50": style50_panel
        });
    }
});