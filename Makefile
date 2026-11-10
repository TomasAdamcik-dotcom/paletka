UUID := paletka@adamciktomas.github.io
ZIP := dist/$(UUID).shell-extension.zip

.PHONY: test schemas zip install e2e pot clean

test:
	gjs -m tests/run.js

schemas:
	glib-compile-schemas extension/schemas

zip: schemas
	mkdir -p dist
	gnome-extensions pack extension --force --out-dir=dist \
		--extra-source=lib --extra-source=themes --extra-source=vendor \
		--podir=../po

install: zip
	gnome-extensions install --force $(ZIP)

e2e: zip
	tests/e2e/run.sh

pot:
	xgettext --from-code=UTF-8 -L JavaScript -k_ -kN_ -o po/paletka.pot \
		$$(find extension -name '*.js' -not -path '*/vendor/*' | sort)

clean:
	rm -rf dist extension/schemas/gschemas.compiled
