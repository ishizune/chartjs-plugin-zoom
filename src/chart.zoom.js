/*jslint browser:true, devel:true, white:true, vars:true */
/*global require*/

// hammer JS for touch support
var Hammer = require('hammerjs');
Hammer = typeof(Hammer) === 'function' ? Hammer : window.Hammer;

// Get the chart variable
var Chart = require('chart.js');
Chart = typeof(Chart) === 'function' ? Chart : window.Chart;
var helpers = Chart.helpers;

// Take the zoom namespace of Chart
var zoomNS = Chart.Zoom = Chart.Zoom || {};

// Where we store functions to handle different scale types
var zoomFunctions = zoomNS.zoomFunctions = zoomNS.zoomFunctions || {};
var panFunctions = zoomNS.panFunctions = zoomNS.panFunctions || {};

// Default options if none are provided
var defaultOptions = zoomNS.defaults = {
	pan: {
		enabled: true,
		mode: 'xy',
		speed: 20,
		threshold: 10
	},
	zoom: {
		enabled: true,
		mode: 'xy',
		sensitivity: 3
	}
};

function directionEnabled(mode, dir) {
	if (mode === undefined) {
		return true;
	} else if (typeof mode === 'string') {
		return mode.indexOf(dir) !== -1;
	}

	return false;
}

function rangeMaxLimiter(zoomPanOptions, newMax) {
	if (zoomPanOptions.scaleAxes && zoomPanOptions.rangeMax &&
			!helpers.isNullOrUndef(zoomPanOptions.rangeMax[zoomPanOptions.scaleAxes])) {
		var rangeMax = zoomPanOptions.rangeMax[zoomPanOptions.scaleAxes];
		if (newMax > rangeMax) {
			newMax = rangeMax;
		}
	}
	return newMax;
}

function rangeMinLimiter(zoomPanOptions, newMin) {
	if (zoomPanOptions.scaleAxes && zoomPanOptions.rangeMin &&
			!helpers.isNullOrUndef(zoomPanOptions.rangeMin[zoomPanOptions.scaleAxes])) {
		var rangeMin = zoomPanOptions.rangeMin[zoomPanOptions.scaleAxes];
		if (newMin < rangeMin) {
			newMin = rangeMin;
		}
	}
	return newMin;
}

function zoomIndexScale(scale, zoom, center, zoomOptions) {
	var labels = scale.chart.data.labels;
	var minIndex = scale.minIndex;
	var lastLabelIndex = labels.length - 1;
	var maxIndex = scale.maxIndex;
	var sensitivity = zoomOptions.sensitivity;
	var chartCenter =  scale.isHorizontal() ? scale.left + (scale.width/2) : scale.top + (scale.height/2);
	var centerPointer = scale.isHorizontal() ? center.x : center.y;

	zoomNS.zoomCumulativeDelta = zoom > 1 ? zoomNS.zoomCumulativeDelta + 1 : zoomNS.zoomCumulativeDelta - 1;

	if (Math.abs(zoomNS.zoomCumulativeDelta) > sensitivity){
		if(zoomNS.zoomCumulativeDelta < 0){
			if(centerPointer >= chartCenter){
				if (minIndex <= 0){
					maxIndex = Math.min(lastLabelIndex, maxIndex + 1);
				} else{
					minIndex = Math.max(0, minIndex - 1);
				}
			} else if(centerPointer < chartCenter){
				if (maxIndex >= lastLabelIndex){
					minIndex = Math.max(0, minIndex - 1);
				} else{
					maxIndex = Math.min(lastLabelIndex, maxIndex + 1);
				}
			}
			zoomNS.zoomCumulativeDelta = 0;
		}
		else if(zoomNS.zoomCumulativeDelta > 0){
			if(centerPointer >= chartCenter){
				minIndex = minIndex < maxIndex ? minIndex = Math.min(maxIndex, minIndex + 1) : minIndex;
			} else if(centerPointer < chartCenter){
				maxIndex = maxIndex > minIndex ? maxIndex = Math.max(minIndex, maxIndex - 1) : maxIndex;
			}
			zoomNS.zoomCumulativeDelta = 0;
		}
		scale.options.ticks.min = rangeMinLimiter(zoomOptions, labels[minIndex]);
		scale.options.ticks.max = rangeMaxLimiter(zoomOptions, labels[maxIndex]);
	}
}

function zoomTimeScale(scale, zoom, center, zoomOptions) {
	var options = scale.options;

	var range;
	var min_percent;
	if (scale.isHorizontal()) {
		range = scale.right - scale.left;
		min_percent = (center.x - scale.left) / range;
	} else {
		range = scale.bottom - scale.top;
		min_percent = (center.y - scale.top) / range;
	}

	var max_percent = 1 - min_percent;
	var newDiff = range * (zoom - 1);

	var minDelta = newDiff * min_percent;
	var maxDelta = newDiff * max_percent;

	var newMin = scale.getValueForPixel(scale.getPixelForValue(scale.min) + minDelta);
	var newMax = scale.getValueForPixel(scale.getPixelForValue(scale.max) - maxDelta);

	var diffMinMax = newMax.diff(newMin);
	var minLimitExceeded = rangeMinLimiter(zoomOptions, diffMinMax) != diffMinMax;
	var maxLimitExceeded = rangeMaxLimiter(zoomOptions, diffMinMax) != diffMinMax;

	if (!minLimitExceeded && !maxLimitExceeded) {
		options.time.min = newMin;
		options.time.max = newMax;
	}
}

function zoomNumericalScale(scale, zoom, center, zoomOptions) {
	var range = scale.max - scale.min;
	var newDiff = range * (zoom - 1);

	var cursorPixel = scale.isHorizontal() ? center.x : center.y;
	var min_percent = (scale.getValueForPixel(cursorPixel) - scale.min) / range;
	var max_percent = 1 - min_percent;

	var minDelta = newDiff * min_percent;
	var maxDelta = newDiff * max_percent;

	scale.options.ticks.min = rangeMinLimiter(zoomOptions, scale.min + minDelta);
	scale.options.ticks.max = rangeMaxLimiter(zoomOptions, scale.max - maxDelta);
}

function zoomScale(scale, zoom, center, zoomOptions) {
	var fn = zoomFunctions[scale.options.type];
	if (fn) {
		fn(scale, zoom, center, zoomOptions);
	}
}

function doZoom(chartInstance, zoom, center, whichAxes) {
	var ca = chartInstance.chartArea;
	if (!center) {
		center = {
			x: (ca.left + ca.right) / 2,
			y: (ca.top + ca.bottom) / 2,
		};
	}

	var zoomOptions = chartInstance.options.zoom;

	if (zoomOptions && helpers.getValueOrDefault(zoomOptions.enabled, defaultOptions.zoom.enabled)) {
		// Do the zoom here
		var zoomMode = helpers.getValueOrDefault(chartInstance.options.zoom.mode, defaultOptions.zoom.mode);
		zoomOptions.sensitivity = helpers.getValueOrDefault(chartInstance.options.zoom.sensitivity, defaultOptions.zoom.sensitivity);

		// Which axe should be modified when figers were used.
		var _whichAxes;
		if (zoomMode == 'xy' && whichAxes !== undefined) {
			// based on fingers positions
			_whichAxes = whichAxes;
		} else {
			// no effect
			_whichAxes = 'xy';
		}

		helpers.each(chartInstance.scales, function(scale, id) {
			if (scale.isHorizontal() && directionEnabled(zoomMode, 'x') && directionEnabled(_whichAxes, 'x')) {
				zoomOptions.scaleAxes = "x";
				zoomScale(scale, zoom, center, zoomOptions);
			} else if (!scale.isHorizontal() && directionEnabled(zoomMode, 'y') && directionEnabled(_whichAxes, 'y')) {
				// Do Y zoom
				zoomOptions.scaleAxes = "y";
				zoomScale(scale, zoom, center, zoomOptions);
			}
		});

		if (zoomOptions.onZoom) {
			zoomOptions.onZoom.call(chartInstance, zoom, center);
		}

		chartInstance.update(0);
	}
}

function panIndexScale(scale, delta, panOptions) {
	var labels = scale.chart.data.labels;
	var lastLabelIndex = labels.length - 1;
	var offsetAmt = Math.max((scale.ticks.length - ((scale.options.gridLines.offsetGridLines) ? 0 : 1)), 1);
	var panSpeed = panOptions.speed;
	var minIndex = scale.minIndex;
	var step = Math.round(scale.width / (offsetAmt * panSpeed));
	var maxIndex;

	zoomNS.panCumulativeDelta += delta;

	minIndex = zoomNS.panCumulativeDelta > step ? Math.max(0, minIndex -1) : zoomNS.panCumulativeDelta < -step ? Math.min(lastLabelIndex - offsetAmt + 1, minIndex + 1) : minIndex;
	zoomNS.panCumulativeDelta = minIndex !== scale.minIndex ? 0 : zoomNS.panCumulativeDelta;

	maxIndex = Math.min(lastLabelIndex, minIndex + offsetAmt - 1);

	scale.options.ticks.min = rangeMinLimiter(panOptions, labels[minIndex]);
	scale.options.ticks.max = rangeMaxLimiter(panOptions, labels[maxIndex]);
}

function panTimeScale(scale, delta, panOptions) {
	var options = scale.options;
	var limitedMax = rangeMaxLimiter(panOptions, scale.getValueForPixel(scale.getPixelForValue(scale.max) - delta));
	var limitedMin = rangeMinLimiter(panOptions, scale.getValueForPixel(scale.getPixelForValue(scale.min) - delta));

	var limitedTimeDelta = delta < 0 ? limitedMax - scale.max : limitedMin - scale.min;

	options.time.max = scale.max + limitedTimeDelta;
	options.time.min = scale.min + limitedTimeDelta;
}

function panNumericalScale(scale, delta, panOptions) {
	var tickOpts = scale.options.ticks;
	var start = scale.start,
		end = scale.end;

	if (tickOpts.reverse) {
		tickOpts.max = scale.getValueForPixel(scale.getPixelForValue(start) - delta);
		tickOpts.min = scale.getValueForPixel(scale.getPixelForValue(end) - delta);
	} else {
		tickOpts.min = scale.getValueForPixel(scale.getPixelForValue(start) - delta);
		tickOpts.max = scale.getValueForPixel(scale.getPixelForValue(end) - delta);
	}
	tickOpts.min = rangeMinLimiter(panOptions, tickOpts.min);
	tickOpts.max = rangeMaxLimiter(panOptions, tickOpts.max);
}

function panScale(scale, delta, panOptions) {
	var fn = panFunctions[scale.options.type];
	if (fn) {
		fn(scale, delta, panOptions);
	}
}

function doPan(chartInstance, deltaX, deltaY) {
	var panOptions = chartInstance.options.pan;
	if (panOptions && helpers.getValueOrDefault(panOptions.enabled, defaultOptions.pan.enabled)) {
		var panMode = helpers.getValueOrDefault(chartInstance.options.pan.mode, defaultOptions.pan.mode);
		panOptions.speed = helpers.getValueOrDefault(chartInstance.options.pan.speed, defaultOptions.pan.speed);

		helpers.each(chartInstance.scales, function(scale, id) {
			if (scale.isHorizontal() && directionEnabled(panMode, 'x') && deltaX !== 0) {
				panOptions.scaleAxes = "x";
				panScale(scale, deltaX, panOptions);
			} else if (!scale.isHorizontal() && directionEnabled(panMode, 'y') && deltaY !== 0) {
				panOptions.scaleAxes = "y";
				panScale(scale, deltaY, panOptions);
			}
		});

		if (panOptions.onPan) {
			panOptions.onPan.call(chartInstance, deltaX, deltaY);
		}

		chartInstance.update(0);
	}
}

function positionInChartArea(chartInstance, position) {
	return 	(position.x >= chartInstance.chartArea.left && position.x <= chartInstance.chartArea.right) &&
		(position.y >= chartInstance.chartArea.top && position.y <= chartInstance.chartArea.bottom);
}

function getYAxis(chartInstance) {
	var scales = chartInstance.scales;

	for (var scaleId in scales) {
		var scale = scales[scaleId];

		if (!scale.isHorizontal()) {
			return scale;
		}
	}
}

// Store these for later
zoomNS.zoomFunctions.category = zoomIndexScale;
zoomNS.zoomFunctions.time = zoomTimeScale;
zoomNS.zoomFunctions.linear = zoomNumericalScale;
zoomNS.zoomFunctions.logarithmic = zoomNumericalScale;
zoomNS.panFunctions.category = panIndexScale;
zoomNS.panFunctions.time = panTimeScale;
zoomNS.panFunctions.linear = panNumericalScale;
zoomNS.panFunctions.logarithmic = panNumericalScale;
// Globals for catergory pan and zoom
zoomNS.panCumulativeDelta = 0;
zoomNS.zoomCumulativeDelta = 0;

// Chartjs Zoom Plugin
var zoomPlugin = {
	afterInit: function(chartInstance) {
		helpers.each(chartInstance.scales, function(scale) {
			scale.originalOptions = JSON.parse(JSON.stringify(scale.options));
		});

		chartInstance.resetZoom = function() {
			helpers.each(chartInstance.scales, function(scale, id) {
				var timeOptions = scale.options.time;
				var tickOptions = scale.options.ticks;

				if (timeOptions) {
					delete timeOptions.min;
					delete timeOptions.max;
				}

				if (tickOptions) {
					delete tickOptions.min;
					delete tickOptions.max;
				}

				scale.options = helpers.configMerge(scale.options, scale.originalOptions);
			});

			helpers.each(chartInstance.data.datasets, function(dataset, id) {
				dataset._meta = null;
			});

			chartInstance.update();
		};

	},
	beforeInit: function(chartInstance) {
		chartInstance.zoom = {};

		var node = chartInstance.zoom.node = chartInstance.chart.ctx.canvas;

		var options = chartInstance.options;
		var panThreshold = helpers.getValueOrDefault(options.pan ? options.pan.threshold : undefined, zoomNS.defaults.pan.threshold);

		if (options.zoom && options.zoom.enabled) {
			// Only want to zoom horizontal axis
			options.zoom.mode = 'x';

			chartInstance.zoom._mouseDownHandler = function(event) {
				if (!chartInstance.options.zoom.drag) {
					return;
				}

				chartInstance.zoom._dragZoomStart = event.native;
			};
			Chart.platform.addEventListener(chartInstance, 'mousedown', chartInstance.zoom._mouseDownHandler);

			chartInstance.zoom._mouseMoveHandler = function(event){
				if (!chartInstance.options.zoom.drag) {
					return;
				}

				if (chartInstance.zoom._dragZoomStart) {
					chartInstance.zoom._dragZoomEnd = event.native;
					chartInstance.update(0);
				}

				chartInstance.update(0);
			};
			Chart.platform.addEventListener(chartInstance, 'mousemove', chartInstance.zoom._mouseMoveHandler);

			chartInstance.zoom._mouseUpHandler = function(chartEvent){
				if (!chartInstance.options.zoom.drag) {
					return;
				}

				if (chartInstance.zoom._dragZoomStart) {
					var event = chartEvent.native;
					var chartArea = chartInstance.chartArea;
					var yAxis = getYAxis(chartInstance);
					var beginPoint = chartInstance.zoom._dragZoomStart;
					var offsetX = beginPoint.target.getBoundingClientRect().left;
					var startX = Math.min(beginPoint.clientX, event.clientX) - offsetX;
					var endX = Math.max(beginPoint.clientX, event.clientX) - offsetX;
					var dragDistance = endX - startX;
					var chartDistance = chartArea.right - chartArea.left;
					var zoom = 1 + ((chartDistance - dragDistance) / chartDistance );

					if (dragDistance > 0) {
						chartInstance.zoom._dragZoomStart = null;
						chartInstance.zoom._dragZoomEnd = null;

						doZoom(chartInstance, zoom, {
							x: (dragDistance / 2) + startX,
							y: (yAxis.bottom - yAxis.top) / 2,
						});
					}
				}
			};
			Chart.platform.addEventListener(chartInstance, 'mouseup', chartInstance.zoom._mouseUpHandler);

			chartInstance.zoom._wheelHandler = function(event) {
				if (chartInstance.options.zoom.drag) {
					return;
				}

				var rect = event.target.getBoundingClientRect();
				var offsetX = event.clientX - rect.left;
				var offsetY = event.clientY - rect.top;

				var center = {
					x : offsetX,
					y : offsetY
				};

				if (event.deltaY < 0) {
					doZoom(chartInstance, 1.1, center);
				} else {
					doZoom(chartInstance, 0.909, center);
				}
				// Prevent the event from triggering the default behavior (eg. Content scrolling).
				event.preventDefault();
			};

			node.addEventListener('wheel', chartInstance.zoom._wheelHandler);
		}

		if (Hammer) {
			var mc = new Hammer.Manager(node);
			mc.add(new Hammer.Pinch());
			mc.add(new Hammer.Pan({
				threshold: panThreshold
			}));

			// Hammer reports the total scaling. We need the incremental amount
			var currentPinchScaling;
			var handlePinch = function handlePinch(e) {
				var diff = 1 / (currentPinchScaling) * e.scale;
				var rect = e.target.getBoundingClientRect();
				var offsetX = e.center.x - rect.left;
				var offsetY = e.center.y - rect.top;
				var center = {
					x : offsetX,
					y : offsetY
				};

				// fingers position difference
				var x = Math.abs(e.pointers[0].clientX - e.pointers[1].clientX);
				var y = Math.abs(e.pointers[0].clientY - e.pointers[1].clientY);

				// diagonal fingers will change both (xy) axes
				var p = x / y;
				var xy;
				if (p > 0.3 && p < 1.7) {
					xy = 'xy';
				}
				// x axis
				else if (x > y) {
					xy = 'x';
				}
				// y axis
				else {
					xy = 'y';
				}

				doZoom(chartInstance, diff, center, xy);

				// Keep track of overall scale
				currentPinchScaling = e.scale;
			};

			mc.on('pinchstart', function(e) {
				currentPinchScaling = 1; // reset tracker
			});
			mc.on('pinch', handlePinch);
			mc.on('pinchend', function(e) {
				handlePinch(e);
				currentPinchScaling = null; // reset
				zoomNS.zoomCumulativeDelta = 0;
			});

			var currentDeltaX = null, currentDeltaY = null, panning = false;
      var originalTooltipeFn = chartInstance.options.tooltips && chartInstance.options.tooltips.custom

      var handlePan = function handlePan(e) {
				if (!options.pan || !options.pan.enabled) {
					return;
				}

				if (currentDeltaX !== null && currentDeltaY !== null) {
					panning = true;
					var deltaX = e.deltaX - currentDeltaX;
					var deltaY = e.deltaY - currentDeltaY;
					currentDeltaX = e.deltaX;
					currentDeltaY = e.deltaY;
					doPan(chartInstance, deltaX, deltaY);
				}
			};
			var hideTooltip = function hideTooltip() {
				if (!options.tooltips || !options.tooltips.custom) {
					return;
				}

        chartInstance.options.tooltips.custom.call(chartInstance, Object.assign(chartInstance.tooltip._model, {
          opacity: 0
        }))

        chartInstance.options.tooltips.custom = function () {}
			};

			mc.on('panstart', function(e) {
				currentDeltaX = 0;
				currentDeltaY = 0;
				hideTooltip()
				handlePan(e);
			});
			mc.on('panmove', handlePan);
			mc.on('panend', function(e) {
			  currentDeltaX = null;
			  currentDeltaY = null;
                          if(originalTooltipeFn){
          chartInstance.options.tooltips.custom = originalTooltipeFn
        }
                          zoomNS.panCumulativeDelta = 0;
				setTimeout(function() { panning = false; }, 500);
			  });


			chartInstance.zoom._ghostClickHandler = function(e) {
				if (panning) {
					e.stopImmediatePropagation();
					e.preventDefault();
				}
			};
			node.addEventListener('click', chartInstance.zoom._ghostClickHandler);

			chartInstance._mc = mc;
		}
	},

	beforeDraw: function(chartInstance) {
		var datasets = chartInstance.data.datasets;
		var meta, i, j, ilen, jlen;

		for (i = 0, ilen = datasets.length; i < ilen; ++i) {
			if (!chartInstance.isDatasetVisible(i)) {
				continue;
			}

			meta = chartInstance.getDatasetMeta(i);
			for (j = 0, jlen = meta.data.length; j < jlen; ++j) {
				var view = meta.data[j]._view;
				var xScale = meta.data[j]._xScale;
				view.skip = (view.x < xScale.left || view.x > xScale.right);
			}
		}
	},

	beforeDatasetsDraw: function(chartInstance) {
		var ctx = chartInstance.chart.ctx;
		var chartArea = chartInstance.chartArea;
		ctx.save();
		ctx.beginPath();

		if (chartInstance.zoom._dragZoomEnd) {
			var yAxis = getYAxis(chartInstance);
			var beginPoint = chartInstance.zoom._dragZoomStart;
			var endPoint = chartInstance.zoom._dragZoomEnd;
			var offsetX = beginPoint.target.getBoundingClientRect().left;
			var startX = Math.min(beginPoint.clientX, endPoint.clientX) - offsetX;
			var endX = Math.max(beginPoint.clientX, endPoint.clientX) - offsetX;
			var rectWidth = endX - startX;


			ctx.fillStyle = 'rgba(180,180,180,0.7)';
			ctx.lineWidth = 5;
			ctx.fillRect(startX, yAxis.top, rectWidth, yAxis.bottom - yAxis.top);
		}

		ctx.rect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
		ctx.clip();
	},

	afterDatasetsDraw: function(chartInstance) {
		chartInstance.chart.ctx.restore();
	},

	destroy: function(chartInstance) {
		if (chartInstance.zoom) {
			var options = chartInstance.options;
			var node = chartInstance.zoom.node;

			if (options.zoom && options.zoom.enabled) {
				Chart.platform.removeEventListener(chartInstance, 'mousedown', chartInstance.zoom._mouseDownHandler);
				Chart.platform.removeEventListener(chartInstance, 'mousemove', chartInstance.zoom._mouseMoveHandler);
				Chart.platform.removeEventListener(chartInstance, 'mouseup', chartInstance.zoom._mouseUpHandler);
				node.removeEventListener('wheel', chartInstance.zoom._wheelHandler);
			}

			if (Hammer) {
				node.removeEventListener('click', chartInstance.zoom._ghostClickHandler);
			}

			delete chartInstance.zoom;

			var mc = chartInstance._mc;
			if (mc) {
				mc.remove('pinchstart');
				mc.remove('pinch');
				mc.remove('pinchend');
				mc.remove('panstart');
				mc.remove('pan');
				mc.remove('panend');
			}
		}
	}
};

module.exports = zoomPlugin;
Chart.pluginService.register(zoomPlugin);
