/**
 * 模块加载器
 * define
 * momo.use
 * momo.config
 * momo.version
 * require.async
 * 
 * 模块路径规则：group/mod/version/path
 */
;(function(global, util){
//global 指向window对象 所有global对象上扩展出来的都会关联到window上
	if(global.momo){
		return;
	}
	
	// 设置全局命名空间
	var momo = global.momo = {};
	
	// 配置
	var config = {
		// 加载根路径
		base: "",
		/**
		 * 合并分割符号
		 * 如：["!!", ","]
		 * 则：["a/b/c/d", "a/b/c/e", "a/b/m/n"] => "a/b!!c/d,c/e,m/n"
		 */
		comboSyntax: null
	};
	
	/**
	 * 版本
	 * {
	 * 		"group/mod": "version",
	 * 		... ...
	 * }
	 */
	var versions = {};
	
	// 获取路径的模块名
	// group/mod/... => group/mod
	function getModId(path){
		return path.split("/").slice(0, 2).join("/");
	}
	// 模块路径添加版本
	// group/mod/path => group/mod/version/path
	function resolveVersion(path){
		var ModId = getModId(path),
			version;
		// 如果存在版本记录，则将版本号注入到路径中
		if(version = versions[ModId]){
			path = path.replace(ModId, [ModId, version].join("/"));
		}
		
		return path;
	}
	
	// 获取模块版本
	function getVersion(path){
		var ModId = getModId(path);
		return versions[ModId];
	}
	
	// 获取路径
	// a/b/c/d => a/b/c/
	var DIRNAME_RE = /[^?#]*\//;
	function dirname(path) {
		return path.match(DIRNAME_RE)[0]
	}
	
	// 转换路径
	var DOT_RE = /\/\.\//g;
	var DOUBLE_DOT_RE = /\/[^/]+\/\.\.\//;
	var MULTI_SLASH_RE = /([^:/])\/+\//g;
	
	function realpath(path) {
		// /a/b/./c/./d ==> /a/b/c/d
		path = path.replace(DOT_RE, "/");
		
		/**
		 *	a//b/c ==> a/b/c
		 *	a///b/////c ==> a/b/c
		 *	DOUBLE_DOT_RE matches a/b/c//../d path correctly only if replace // with / first
		 */
		path = path.replace(MULTI_SLASH_RE, "$1/");
		
		// a/b/c/../../d  ==>  a/b/../d  ==>  a/d
		while (path.match(DOUBLE_DOT_RE)) {
			path = path.replace(DOUBLE_DOT_RE, "/");
		}
		
		return path;
	}
	
	/**
	 * 模块加载列表
	 * {
	 * 		"a/b": "__loading__",
	 * 		"a/c": "__waiting__",
	 * 		"a/d": [Object],
	 * 		... ...
	 * }
	 */
	var mods = {};
	
	// 模块加载状态
	// 等待解析中
	var WAITING = "__waiting__";
	// 加载中
	var LOADING = "__loading__";
	
	
	// 返回模块
	function require(id){
		return mods[id];
	}
	
	var doc = global.document;
	var head = doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement;
	// 请求文件队列
	var requestList = [];
	//事件加载句柄
	var requestHandler = null;
	function request(id){
		//id无效 或者已经加载过的模块
		if(!id || typeof mods[id] !== "undefined"){
			return;
		}
		
		// 修改模块状态，加入待加载列表
		mods[id] = LOADING;
		requestList.push(id);
		
		function request(){
			//闭包 清空引用
			requestHandler = null;
			
			var script = doc.createElement("script");
			
			function onload(){
				//确保只执行一次下载操作
				script.onload = script.onerror = script.onreadystatechange = null;
				head.removeChild(script);
				//清空script节点 防止低版本 ie 造成内存溢出
				script = null;
			}
			//in操作符用来判断某个属性属于某个对象，可以是对象的直接属性，也可以是通过prototype继承的属性 
			//对于一般的对象属性需要用字符串指定属性的名称;
			//对于数组属性需要指定数字形式的索引值来表示数组的属性名称（固有属性除外，如length）。
			//in的右边必须是一个对象
			//如果你使用delete操作符删除了一个属性，再次用in检查时，会返回false
			//如果你把一个属性值设为undefined，但是没有使用delete操作符，使用in检查，会返回true.
			if("onload" in script){
				script.onload = onload;
				script.onerror = function(){
					//console.error(id + " load fail");
					onload();
				};
			}else{
				script.onreadystatechange = function(){
					if(/loaded|complete/.test(script.readyState)){
						onload();
					}
				};
			}
			
			script.async = true;
			
			var ids = [],
				id,
				mod,
				storeList = [];
			for(var i = 0, l = requestList.length; i < l; i ++){
				id = requestList[i];
				if(mods[id] === LOADING){
					if(util.store){
						mod = util.store.get(id, getVersion(id));
						if(mod){
							// 本地存储中存在该模块，加入待解析模块列表
							storeList.push({
								id: id,
								mod: mod
							});
							continue;
						}
					}
					// 将路径加入待加载列表
					ids.push(resolveVersion(id).replace(/\.js$/, "") + ".js");
				}
			}
			requestList = [];
			
			// 解析存储中的模块
			var store;
			for(i = 0, l = storeList.length; i < l; i ++){
				store = storeList[i];
				global.define(store.id, store.mod.deps, store.mod.factory, true);
			}
			
			// 加载需加载模块
			if(ids.length){
				if(ids.length === 1){
					script.src = [config.base, ids[0]].join("/");
				}else{
					// 多个文件按规则合并路径
					script.src = config.base + config.comboSyntax[0] + ids.join(config.comboSyntax[1]);
				}
				head.appendChild(script);
			}else{
				script = null;
			}
		}
		
		if(config.comboSyntax){
			if(requestHandler){
				clearTimeout(requestHandler);//清除一次主程序中多次调用该方法的以往句柄
			}
			//调整请求模块异步事件 到 事件队列的队尾 （js是单线程执行 只有主线程执行完成之后才回去执行 此处只是标记 request事件等到主流程执行完后去执行，并且只执行一次）
			// 如果主流程中有多个依赖模块加载 循环调用request（id） 测只会添加 requestList队列并且标记模块状态，而rquest方法只会执行最后一次
			requestHandler = setTimeout(request, 1);
		}else{
			request();
		}
	}
	
	// seed列表
	var seeds = {};
	
	//立即执行函数  验证种子是否加载
	var checkSeed = (function(){
		// 检查依赖id的模块列表
		function checkSeeds(id){
			var _seeds = seeds[id] || [];
			// 此处每次循环都取length防止循环过程中，列表新增seed
			for(var i = 0; i < _seeds.length; i ++){
				checkSeed(_seeds[i]); 
			}
			
			delete seeds[id];
		}
		
		// 检查模块依赖是否ready
		var tmpMod = {};
		
		return function(seed){
			var deps = seed.deps;
			
			//多个依赖模块加载
			for(var i = 0, l = deps.length, dep, mod; i < l; i ++){
				dep = deps[i];
				
				if(!(mod = mods[dep])){
					// 如果模块还未加载，则去异步加载模块（ 仅仅去添加到模块加载队列中，标记当前模块为加载中状态）
					request(dep);
				}
				// 由于模块加载可能异步，也可能同步，所以需要二次判断
				// 进行checkSeeds 过来的时候
				if(mod || (mod = mods[deps[i]])){
					// 假如模块已经加载解析完成，从依赖中去掉
					if(mod !== LOADING && mod !== WAITING){
						deps.splice(i, 1);
						i --;
						l --;
					}
				}
			}
			
			var _require;
			
			// 如果依赖都已加载解析完成，则解析模块的工厂方法
			//如果是 通过checkSeeds进行二次验证过来的 主模块所有的依赖模块都 已经加载完成 则去解析主模块的工厂方法
			if(deps.length === 0){
				if(seed.id){
					tmpMod.exports = {};
					
					_require = function(id){
						// 转换相对路径
						if(/^(\.){1,2}\//.test(id)){
							id = realpath([dirname(seed.id), id].join("/"));
						}
						return require(id);
					};
					
					_require.async = momo.use;
					
					seed.factory(_require, tmpMod.exports, tmpMod);
					//执行工厂回调方法后 获取当前模块输出 存储到mods 表示模块加载完成
					mods[seed.id] = tmpMod.exports;
					
					// 检查依赖该模块的其他模块 二次验证
					checkSeeds(seed.id);
				}else{
					seed.factory();
				}
				
				return true;
			}
			
			return false;
		};
	})();
	
	/**
	 * 模块定义入口
	 */
	global.define = function(id, deps, factory, noStore){
		if(id){
			// 设置模块为待解析状态
			mods[id] = WAITING;
			// 将模块存入本地
			if(util.store && !noStore){
				util.store.set(id, getVersion(id), deps, factory);
			}
		}
		
		// 生成模块加载种子
		var seed = {
			id: id,
			deps: deps,
			factory: factory
		};
		
		var i, l, dep;
		if(!checkSeed(seed)){
			// 假如有依赖模块未加载，将种子加入依赖模块监听队列
			for(i = 0, l = deps.length; i < l; i ++){
				dep = deps[i];
				if(!seeds[dep]){
					seeds[dep] = [];
				}
				seeds[dep].push(seed);
			}
		}
	};
	
	/**
	 * 
	 */
	momo.use = function(ids, callback){
		ids = [].concat(ids).map(function(id){
			return util.transModName(id);
		});
		global.define("", [].concat(ids), function(){
			for(var i = 0, l = ids.length; i < l; i ++){
				ids[i] = require(ids[i]);
			}
			callback.apply(global, ids);
		});
	};
	
	/**
	 * 配置加载参数
	 */
	momo.config = function(_config){
		for(var key in _config){
			if(_config.hasOwnProperty(key)){
				config[key] = _config[key];
			}
		}
	};
	
	/**
	 * 配置版本号
	 * momo.version("groupName", {
	 * 		"modName": "v.1",
	 * 		"modName": "v.2"
	 * })
	 */
	momo.version = function(group, version){
		for(var modName in version){
			versions[[group, modName].join("/")] = version[modName];
		}
	};

	/**
	 * 本地存储
	 */
	momo.store = util.nativeStore;

	/**
	 * 兼容seajs 
	 */
	global.seajs = momo;
})(this, (function(){
	// 本地存储模块
	var store,
		win = window,
		localStorageName = 'localStorage',
		storage;
	
	if (localStorageName in win && win[localStorageName]) {
		storage = win[localStorageName];
		store = {
			get: function (key) {
				return storage.getItem(key);
			},
			set: function (key, val) {
				try{
					storage.setItem(key, val);
				}catch(e){}
			},
			remove: function (key) {
				storage.removeItem(key);
			}
		};
	}
	
	function parseJson(data){
		try{
		    return ( new Function( "return " + data.replace(/^\s+|\s+$/g, "") ) )();
		}catch(e){
			return null;
		}
	}

	var ModVisitManage = (function(){
		var modManageKey = "mod-visit-manager";

		function getModManage(){
			var config = store.get(modManageKey);
			if(config && (config = JSON.parse(config))){
				return config;
			}else{
				return {};
			}
		}
		
		function setModManage(config){
			store.set(modManageKey, JSON.stringify(config));
		}

		// 获取当前相对于2015年1月1日所过去的天数
		function getNow(){
			return ((new Date() - new Date(2015, 0, 1)) / (24 * 3600 * 1000)) | 0;
		}

		return {
			// 更新模块访问时间
			update: function(id){
				var config = getModManage();
				config[id] = getNow();
				setModManage(config);
			},
			// 删除模块访问时间
			"delete": function(id){
				var config = getModManage();
				delete config[id];
				setModManage(config);
			},
			// 清除最后访问时间超过expires天的模块
			clear: function(expires){
				var config = getModManage();
				var now = getNow();
				for(var id in config){
					if(now - config[id] > expires){
						delete config[id];
						store.remove(id);
					}
				}
				setModManage(config);
			}
		};
	})();
	
	// 清除30天未访问的模块
	setTimeout(function(){
		ModVisitManage.clear(30);
	}, 5000);


	/**
	 * 模块名转换为模块地址方法
	 * 例如：jquery -> lib/jquery/index
	 * 		part:form -> part/form/index
	 */

	function getType(name){
		if(/^(\.){1,2}\//.test(name)){
			return "relative";
		}else if(/^[\w\-:]+$/.test(name)){
			return "module-name";
		}else{
			return "normal";
		}
	}

	function transModName(name){
		var type = getType(name);
		// 非相对地址，缺省命名空间的，默认为lib
		if(type !== "relative" && name.indexOf(":") === -1){
			name = "lib:" + name;
		}
		// 转换命名空间连接符
		name = name.replace(/:/g, "/");
		// 如果是模块名，则追加默认index入口文件路径
		if(type === "module-name"){
			return name + "/index";
		}
		return name;
	}

	function noop(){}
	
	return {
		nativeStore: store || {
			get: noop,
			set: noop,
			remove: noop
		},
		store: false && store ? {
			get: function(id, version){
				var mod = store.get(id);
				if(mod){
					if((mod = JSON.parse(mod)) && mod.version === version){
						ModVisitManage.update(id);
						return {
							deps: mod.deps,
							factory: parseJson(mod.factory)
						};
					}else{
						store.remove(id);
						ModVisitManage["delete"](id);
					}
				}
			},
			set: function(id, version, deps, factory){
				store.set(id, JSON.stringify({
					version: version,
					deps: deps,
					factory: factory.toString()
				}));
				ModVisitManage.update(id);
			}
		} : null,
		transModName: transModName
	};
})());
