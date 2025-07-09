dist: node_modules
	@echo "Building..."
	@npm run build

node_modules:
	@echo "Installing Node.js dependencies..."
	@npm install

.PHONY: clean-dist
clean-dist:
	@echo "Cleaning dist directory..."
	@rm -rf dist

.PHONY: clean
clean: clean-dist
	@echo "Cleaning dependencies..."
	@rm -rf node_modules