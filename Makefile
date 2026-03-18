NAME = annotator-gnome-extension
DOMAIN = fengzhongshaonian.github.io
UUID = $(NAME)@$(DOMAIN)
EXT_DIR = ~/.local/share/gnome-shell/extensions/$(UUID)

MODERN_ZIP = $(NAME)-gnome-45-49.zip
SCHEMAS = schemas/gschemas.compiled
EXTRAS = icon.png README.md LICENSE

.PHONY: all pack pack-modern pack-legacy install install-modern install-legacy clean

all: pack

node_modules: package.json
	npm install

dist/extension.js dist/prefs.js: node_modules
	node_modules/typescript/bin/tsc

$(SCHEMAS): schemas/org.gnome.shell.extensions.$(NAME).gschema.xml
	glib-compile-schemas schemas

$(MODERN_ZIP): dist/extension.js dist/prefs.js $(SCHEMAS)
	@cp -r schemas metadata.json dist/
	@cp -f $(EXTRAS) dist/ 2>/dev/null || true
	@cd dist && zip -9r ../$@ .

pack: $(MODERN_ZIP)

install:
	@rm -rf $(EXT_DIR) && mkdir -p $(EXT_DIR)
	cp -r dist/* $(EXT_DIR)/

clean:
	@rm -rf dist node_modules $(MODERN_ZIP)
