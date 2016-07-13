'use strict';

import { async } from 'metal';
import connect from '../src/connect';
import JSXComponent from 'metal-jsx';
import Provider from '../src/Provider';

describe('connect', function() {
	var OriginalComponent;
	var component;

	beforeEach(function() {
		class TestComponent extends JSXComponent {
			render() {
				return <div>{this.props.foo}</div>;
			}
		}
		OriginalComponent = TestComponent;
	});

	afterEach(function() {
		if (component) {
			component.dispose();
		}
	});

	it('should return another component constructor when "connect" is called', function() {
		var TestComponent = connect()(OriginalComponent);
		assert.notStrictEqual(OriginalComponent, TestComponent);
	});

	it('should render the received component', function() {
		var TestComponent = connect()(OriginalComponent);
		component = new TestComponent({
			store: buildStoreStub()
		});

		var names = Object.keys(component.components);
		assert.strictEqual(1, names.length);

		var child = component.components[names[0]];
		assert.ok(child instanceof OriginalComponent);
		assert.strictEqual(component.element, child.element);
	});

	it('should pass any props data to the inner component', function() {
		var TestComponent = connect()(OriginalComponent);
		component = new TestComponent({
			foo: 'foo',
			store: buildStoreStub()
		});

		var names = Object.keys(component.components);
		var child = component.components[names[0]];
		assert.strictEqual('foo', child.props.foo);
	});

	describe('store', function() {
		it('should return the store being used', function() {
			var store = buildStoreStub();
			var TestComponent = connect()(OriginalComponent);
			component = new TestComponent({
				store
			});
			assert.strictEqual(store, component.getStore());
		});

		it('should throw error if no store is passed to wrapped component', function() {
			var TestComponent = connect()(OriginalComponent);
			assert.throws(() => component = new TestComponent());
		});

		it('should use store from Provider parent when there is one', function() {
			var store = buildStoreStub();
			var TestComponent = connect()(OriginalComponent);
			class MainComponent extends JSXComponent {
				render() {
					return <Provider store={store}>
						<TestComponent ref="connect" />
					</Provider>
				}
			}

			component = new MainComponent();
			var child = component.components.connect;
			assert.strictEqual(store, child.getStore());
		});

		it('should not subscribe to given store by default', function() {
			var store = buildStoreStub();
			var TestComponent = connect()(OriginalComponent);
			component = new TestComponent({
				store
			});
			assert.strictEqual(0, store.subscribe.callCount);
		});

		it('should not throw error when detaching and no "mapStoreStateToProps" was given', function() {
			var TestComponent = connect()(OriginalComponent);
			component = new TestComponent({
				store: buildStoreStub()
			});
			assert.doesNotThrow(() => component.detach());
		});

		it('should subscribe to given store if "mapStoreStateToProps" is given', function() {
			var store = buildStoreStub();
			var TestComponent = connect(sinon.stub())(OriginalComponent);
			component = new TestComponent({
				store
			});
			assert.strictEqual(1, store.subscribe.callCount);
		});

		it('should unsubscribe to given store when detached if "mapStoreStateToProps"', function() {
			var unsubscribe = sinon.stub();
			var store = buildStoreStub();
			store.subscribe.returns(unsubscribe);

			var TestComponent = connect(sinon.stub())(OriginalComponent);
			component = new TestComponent({
				store
			});
			assert.strictEqual(0, unsubscribe.callCount);

			component.detach();
			assert.strictEqual(1, unsubscribe.callCount);
		});
	});

	describe('mapStoreStateToProps', function() {
		it('should not pass anything from store state to inner component by default', function() {
			var store = buildStoreStub();
			store.getState.returns({
				foo: 'foo'
			});

			var TestComponent = connect()(OriginalComponent);
			component = new TestComponent({
				store
			});

			var names = Object.keys(component.components);
			var child = component.components[names[0]];
			assert.ok(!child.props.foo);
		});

		it('should pass data specified by "mapStoreStateToProps" to inner component', function() {
			var store = buildStoreStub();
			store.getState.returns({
				foo: 'foo',
				bar: 'bar'
			});

			function mapDispatchToProps(state) {
				return {
					foo: state.foo
				};
			}

			var TestComponent = connect(mapDispatchToProps)(OriginalComponent);
			component = new TestComponent({
				store
			});

			var names = Object.keys(component.components);
			var child = component.components[names[0]];
			assert.strictEqual('foo', child.props.foo);
			assert.ok(!child.props.bar);
		});

		it('should update inner component when the store state it uses changes', function(done) {
			var store = buildStoreStub();
			store.getState.returns({
				foo: 'foo'
			});

			var TestComponent = connect(state => state)(OriginalComponent);
			component = new TestComponent({
				store
			});

			var names = Object.keys(component.components);
			var child = component.components[names[0]];
			assert.strictEqual('foo', child.props.foo);
			assert.strictEqual('foo', child.element.textContent);

			assert.strictEqual(1, store.subscribe.callCount);
			store.getState.returns({
				foo: 'bar'
			});
			store.subscribe.args[0][0]();

			component.once('rendered', function() {
				assert.strictEqual('bar', child.props.foo);
				assert.strictEqual('bar', child.element.textContent);
				done();
			});
		});

		it('should not update inner component when the store state it doesn\'t use changes', function(done) {
			var store = buildStoreStub();
			store.getState.returns({
				foo: 'foo',
				bar: 'bar'
			});

			var TestComponent = connect(({ foo }) => ({ foo }))(OriginalComponent);
			component = new TestComponent({
				store
			});

			var names = Object.keys(component.components);
			var child = component.components[names[0]];
			assert.strictEqual('foo', child.props.foo);
			assert.strictEqual('foo', child.element.textContent);
			assert.strictEqual(1, store.subscribe.callCount);

			var listener = sinon.stub();
			component.on('rendered', listener);

			store.getState.returns({
				foo: 'foo',
				bar: 'bar2'
			});
			store.subscribe.args[0][0]();

			async.nextTick(function() {
				assert.strictEqual(0, listener.callCount);
				done();
			});
		});

		it('should subscribe parent components to store before child components', function() {
			var store = buildStoreStub();
			store.getState.returns({
				foo: 'foo'
			});

			var ChildComponent = connect(state => state)(OriginalComponent);
			class ParentComponent extends JSXComponent {
				render() {
					return <ChildComponent store={this.props.store} />
				}
			}
			var TestComponent = connect(state => state)(ParentComponent);

			component = new TestComponent({
				store
			});
			store.getState.returns({
				foo: 'bar'
			});
			assert.strictEqual(2, store.subscribe.callCount);

			store.subscribe.args[0][0]();
			assert.strictEqual(store.getState(), component.state.storeState);
		});

		it('should receive store state and component props in "mapStoreStateToProps"', function() {
			var store = buildStoreStub();
			var storeState = {};
			store.getState.returns(storeState);

			var mapDispatchToProps = sinon.stub();
			var TestComponent = connect(mapDispatchToProps)(OriginalComponent);
			component = new TestComponent({
				store,
				foo: 'foo'
			});

			assert.strictEqual(1, mapDispatchToProps.callCount);
			assert.strictEqual(storeState, mapDispatchToProps.args[0][0]);
			assert.deepEqual(component.props, mapDispatchToProps.args[0][1]);
		});
	});

	describe('mapDispatchToProps', function() {
		it('should pass dispatch function from store to inner component by default', function() {
			var store = buildStoreStub();
			var TestComponent = connect()(OriginalComponent);
			component = new TestComponent({
				store
			});

			var names = Object.keys(component.components);
			var child = component.components[names[0]];
			assert.strictEqual(store.dispatch, child.props.dispatch);
		});

		it('should pass data specified by "mapDispatchToProps" instead of dispatch function to inner component', function() {
			function mapDispatchToProps(dispatch) {
				return {
					foo: () => dispatch('foo')
				};
			}
			var TestComponent = connect(null, mapDispatchToProps)(OriginalComponent);
			component = new TestComponent({
				store: buildStoreStub()
			});

			var store = component.getStore();
			var names = Object.keys(component.components);
			var child = component.components[names[0]];
			assert.ok(!child.props.dispatch);
			assert.ok(child.props.foo);
			assert.strictEqual(0, store.dispatch.callCount);

			child.props.foo();
			assert.strictEqual(1, store.dispatch.callCount);
			assert.strictEqual('foo', store.dispatch.args[0][0]);
		});

		it('should wrap an object of action creators with the store\'s dispatch function', function() {
			function foo(val) {
				return val;
			}
			var TestComponent = connect(null, {foo})(OriginalComponent);
			component = new TestComponent({
				store: buildStoreStub()
			});

			var store = component.getStore();
			var names = Object.keys(component.components);
			var child = component.components[names[0]];
			assert.ok(!child.props.dispatch);
			assert.ok(child.props.foo);
			assert.strictEqual(0, store.dispatch.callCount);

			child.props.foo('bar');
			assert(store.dispatch.calledWithExactly('bar'));
		});
	});

	describe('pure', function() {
		var MainComponent;
		var TestComponent;

		beforeEach(function() {
			class MainTempComponent extends JSXComponent {
				render() {
					return <TestComponent
						foo={this.props.foo}
						ref="connect"
						store={this.props.store}
					/>;
				}
			}
			MainComponent = MainTempComponent;
			MainComponent.PROPS = {
				bar: {
					value: 'bar'
				},
				foo: {
					value: 'foo'
				},
				store: {
					value: buildStoreStub()
				}
			};
		});

		it('should not update inner component when pure component\'s prop values don\'t change', function(done) {
			TestComponent = connect()(OriginalComponent);

			component = new MainComponent();
			var child = component.components.connect;
			var renderer = child.getRenderer();
			sinon.spy(renderer, 'renderIncDom');

			component.props.bar = 'bar2';
			component.once('stateSynced', function() {
				assert.strictEqual(0, renderer.renderIncDom.callCount);
				done();
			});
		});

		it('should update inner component when pure component\'s prop values change', function(done) {
			TestComponent = connect()(OriginalComponent);

			component = new MainComponent();
			var child = component.components.connect;
			var renderer = child.getRenderer();
			sinon.spy(renderer, 'renderIncDom');

			component.props.foo = 'foo2';
			component.once('stateSynced', function() {
				assert.strictEqual(1, renderer.renderIncDom.callCount);
				done();
			});
		});

		it('should update inner component when non pure component\'s prop values don\'t change', function(done) {
			TestComponent = connect(null, null, null, { pure: false })(OriginalComponent);

			component = new MainComponent();
			var child = component.components.connect;
			var renderer = child.getRenderer();
			sinon.spy(renderer, 'renderIncDom');

			component.props.bar = 'bar2';
			component.once('stateSynced', function() {
				assert.strictEqual(1, renderer.renderIncDom.callCount);
				done();
			});
		});
	});
});

function buildStoreStub() {
	var store = {
		dispatch: sinon.stub(),
		getState: sinon.stub().returns({}),
		subscribe: sinon.stub().returns(sinon.stub())
	};
	return store;
}
