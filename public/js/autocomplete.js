/**
 * Debounced search-select widget.
 *
 * Wrapper needs [data-search-select] + data-search-url (GET ?q= endpoint
 * returning [{value, label, sublabel}]), optionally data-debounce (ms,
 * default 250) and data-min-chars (default 2).
 *
 * Inside: [data-role="search-input"] is the text box. Optional
 * [data-role="hidden-value"] holds the real submitted value (e.g. a
 * carrier id) - if present, picking a result sets hidden.value + shows
 * label in the text box; if absent, the text box itself becomes the
 * picked value.value (used for airport codes). [data-role="results"] is
 * the results <ul>.
 */
(function () {
  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, delay);
    };
  }

  function SearchSelect(root) {
    this.root = root;
    this.input = root.querySelector('[data-role="search-input"]');
    this.hidden = root.querySelector('[data-role="hidden-value"]');
    this.list = root.querySelector('[data-role="results"]');
    this.url = root.dataset.searchUrl;
    this.minChars = parseInt(root.dataset.minChars || '2', 10);
    this.results = [];
    this.activeIndex = -1;
    this.controller = null;

    if (!this.input || !this.list || !this.url) return;

    var debounced = debounce(this.onInput.bind(this), parseInt(root.dataset.debounce || '250', 10));
    this.input.addEventListener('input', debounced);
    this.input.addEventListener('keydown', this.onKeydown.bind(this));
    this.input.addEventListener('blur', this.onBlur.bind(this));
    // Prevent the input's blur from firing before a click on a result registers.
    this.list.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
  }

  SearchSelect.prototype.onBlur = function () {
    var self = this;
    setTimeout(function () {
      self.close();
    }, 150);
  };

  SearchSelect.prototype.onInput = function () {
    var query = this.input.value.trim();

    // Invalidate the previous pick until a new one is made.
    if (this.hidden) this.hidden.value = '';

    if (query.length < this.minChars) {
      this.close();
      return;
    }

    this.fetchResults(query);
  };

  SearchSelect.prototype.fetchResults = function (query) {
    var self = this;
    if (this.controller) this.controller.abort();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    this.controller = controller;

    fetch(this.url + '?q=' + encodeURIComponent(query), {
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('search failed');
        return res.json();
      })
      .then(function (results) {
        self.results = Array.isArray(results) ? results : [];
        self.render();
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        self.close();
      });
  };

  SearchSelect.prototype.render = function () {
    if (this.results.length === 0) {
      this.close();
      return;
    }
    this.activeIndex = -1;
    this.list.innerHTML = '';
    var self = this;
    this.results.forEach(function (r, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');

      var label = document.createElement('span');
      label.className = 'search-select__label';
      label.textContent = r.label;
      li.appendChild(label);

      if (r.sublabel) {
        var sub = document.createElement('span');
        sub.className = 'search-select__sublabel';
        sub.textContent = r.sublabel;
        li.appendChild(sub);
      }

      li.addEventListener('click', function () {
        self.select(i);
      });
      self.list.appendChild(li);
    });
    this.list.hidden = false;
  };

  SearchSelect.prototype.select = function (i) {
    var r = this.results[i];
    if (!r) return;
    if (this.hidden) {
      this.hidden.value = r.value;
      this.input.value = r.label;
    } else {
      this.input.value = r.value;
    }
    this.close();
  };

  SearchSelect.prototype.highlight = function () {
    var children = this.list.children;
    for (var i = 0; i < children.length; i++) {
      children[i].classList.toggle('is-active', i === this.activeIndex);
    }
  };

  SearchSelect.prototype.onKeydown = function (e) {
    if (this.list.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIndex = Math.min(this.activeIndex + 1, this.results.length - 1);
      this.highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIndex = Math.max(this.activeIndex - 1, 0);
      this.highlight();
    } else if (e.key === 'Enter') {
      if (this.activeIndex >= 0) {
        e.preventDefault();
        this.select(this.activeIndex);
      }
    } else if (e.key === 'Escape') {
      this.close();
    }
  };

  SearchSelect.prototype.close = function () {
    this.list.hidden = true;
    this.list.innerHTML = '';
    this.activeIndex = -1;
  };

  document.querySelectorAll('[data-search-select]').forEach(function (el) {
    new SearchSelect(el);
  });
})();
