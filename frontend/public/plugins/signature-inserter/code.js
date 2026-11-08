(function(window, undefined) {
    window.Asc.plugin.init = function(data) {
        var url = "";
        var search = "";
        
        // Try to get from data or URL params
        try {
            if (data) {
                if (typeof data === "string") {
                    try {
                        var parsed = JSON.parse(data);
                        url = parsed.signatureUrl || "";
                        search = parsed.searchText || "";
                    } catch(e) {
                        url = data;
                    }
                } else {
                    url = data.signatureUrl || "";
                    search = data.searchText || "";
                }
            }
            
            if (!url) {
                var params = new URLSearchParams(window.location.search);
                url = params.get("sig") || "";
                search = search || params.get("search") || "";
            }
        } catch(e) {}

        console.log("Signature Plugin: Init. URL=" + url + ", Search=" + search);

        if (!url) {
            console.log("Signature Plugin: No URL found, closing.");
            this.executeCommand("close", "");
            return;
        }

        var _this = this;
        
        // Pass variables to the command scope
        window.Asc.scope.url = url;
        window.Asc.scope.search = search;

        console.log("Signature Plugin: Executing callCommand (Macro)...");

        this.callCommand(function() {
            var oDocument = Api.GetDocument();
            var url = Asc.scope.url;
            var search = Asc.scope.search;
            
            console.log("Macro: Starting search for '" + search + "'");
            var oSearch = oDocument.Search(search);
            
            // Create image (approx 120x60 pixels in EMUs)
            // 1 inch = 914400 EMUs. 120px at 96dpi is 1.25 inches.
            var width = 1.25 * 914400; 
            var height = 0.625 * 914400;
            var oImage = Api.CreateImage(url, width, height);
            
            if (oSearch.length > 0) {
                console.log("Macro: Found " + oSearch.length + " matches.");
                // Get the first match
                var oRange = oSearch[0];
                var oParagraph = oRange.GetParagraph(0);
                
                // Insert the image BEFORE the paragraph containing the role label
                oParagraph.InsertElement(oImage, "before");
                console.log("Macro: Image inserted before paragraph.");
            } else {
                console.log("Macro: Search text '" + search + "' not found. Inserting at beginning as fallback.");
                // Fallback: Insert at the beginning of the document
                var oFirstPara = oDocument.GetElement(0);
                if (oFirstPara) {
                    oFirstPara.InsertElement(oImage, "before");
                } else {
                    oDocument.InsertElement(oImage);
                }
            }
        }, true, true, function() {
            console.log("Signature Plugin: Command finished, closing plugin.");
            // Small delay to ensure command is processed before closing
            setTimeout(function() {
                _this.executeCommand("close", "");
            }, 500);
        });
    };

    window.Asc.plugin.button = function(id) {
        this.executeCommand("close", "");
    };
})(window, undefined);
