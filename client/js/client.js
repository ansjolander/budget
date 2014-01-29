/**
 * This work is licensed under the Creative Commons Attribution-NonCommercial
 * 4.0 International License. To view a copy of this license, visit
 * http://creativecommons.org/licenses/by-nc/4.0/ or send a letter to
 * Creative Commons, 444 Castro Street, Suite 900, Mountain View, California, 94041, USA.
 */

Handlebars.registerHelper('balance', function () {
    return Session.get('balance');
});
Handlebars.registerHelper('start', function () {
    return Session.get('start');
});
Handlebars.registerHelper('end', function () {
    return Session.get('end');
});
Handlebars.registerHelper('isLoggedIn', function() {
    return Meteor.userId() !== null;
});

Meteor.subscribe('events');

/* pass in moment objects */
function getEvents(start, end) {
    var events = Events.find({}).fetch();
    var runTotal = Session.get('balance') ? Session.get('balance') : 0;
    var eventList = [];

    if (typeof start === 'undefined') {
        start = moment().hour(0).minute(0).second(0);
    }
    if (typeof end === 'undefined') {
        end = moment().add('month', 1);
    }

    if (!Session.get('start')) {
        Session.set('start', start.format('MM/DD/YYYY'));
    } else {
        start = moment(Session.get('start'));
    }

    if (!Session.get('end')) {
        Session.set('end', end.format('MM/DD/YYYY'));
    } else {
        end = moment(Session.get('end'));
    }

    $.each(events, function (idx, e) {
        var currDate = e.date;

        if (typeof e.recurringInterval != 'undefined' && e.recurringInterval != '') {
            while (moment(currDate).isBefore(start)) {
                currDate = moment(currDate).add(e.recurringInterval, e.recurringCount).format('YYYY-MM-DD');
            }

            var firstRun = true;
            while (moment(currDate).isBefore(end)) {
                var clone = Object.create(e);

                clone.date = currDate;

                if (firstRun) {
                    clone.isOriginal = true;
                } else {
                    clone._id = null;
                }

                eventList.push(clone);

                firstRun = false;
                currDate = moment(currDate).add(e.recurringInterval, e.recurringCount).format('YYYY-MM-DD');
            }
        } else {
            var clone = Object.create(e);
            clone.isOriginal = true;
            eventList.push(clone);
        }
    });

    eventList.sort(function (a, b) {
        if (a.date == b.date) {
            return a.type == 'income' ? -1 : (a.type == b.type) ? 0 : 1;
        }
        return a.date > b.date ? 1 : -1;
    });

    $.each(eventList, function (idx, e) {
        runTotal = e.runTotal = runTotal + e.amount * (e.type == 'bill' ? -1 : 1);

        if (runTotal <= 0) {
            e.negativeRunTotal = true;
        }

        if (runTotal > 0 && runTotal <= 100) {
            e.lowRunTotal = true;
        }

        e.due = moment(e.date).fromNow();
    });

    return eventList;
}

function getTotalIncome() {
    var totalIncome = Session.get('balance') ? Session.get('balance') : 0;
    var events = getEvents();

    $.each(events, function (idx, e) {
        if (e.type == 'income') {
            totalIncome += parseFloat(e.amount);
        }
    });

    return totalIncome;
}

function getTotalExpenses() {
    var totalExpenses = 0;
    var events = getEvents();

    $.each(events, function (idx, e) {
        if (e.type == 'bill') {
            totalExpenses += parseFloat(e.amount);
        }
    });

    return totalExpenses;
}

function prettyAmounts(eventList) {
    $.each(eventList, function(idx, event) {
        eventList[idx]['amount'] = event.amount.toFixed(2);
        eventList[idx]['runTotal'] = event.runTotal.toFixed(2);
    });
    return eventList;
}

Template.eventsTable.calendarEvents = function () {
    return prettyAmounts(getEvents());
};

Template.snapshot.totalIncome = function () {
    return getTotalIncome().toFixed(2);
};

Template.snapshot.totalExpenses = function () {
    return getTotalExpenses().toFixed(2);
};

Template.snapshot.difference = function () {
    var difference = getTotalIncome() - getTotalExpenses();
    return difference.toFixed(2);
};

Template.addEventButton.events = {
    'click .add-event': function () {
        $('#add-event-modal').modal('show');
    }
};

Template.addEventModal.events = {
    'click .save-event': function (e) {
        e.preventDefault();
        var data = $('#add-event-form').serializeArray();

        var newEvent = {};
        $.each(data, function (idx, elem) {
            newEvent[elem.name] = elem.value;
        });

        newEvent.amount = parseFloat(newEvent.amount);

        if (newEvent._id != "") {
            Events.update(newEvent._id, {
                $set: {
                    name: newEvent.name,
                    type: newEvent.type,
                    amount: parseFloat(newEvent.amount),
                    date: moment(newEvent.date).format('YYYY-MM-DD'),
                    recurringInterval: newEvent.recurringInterval,
                    recurringCount: newEvent.recurringCount,
                    userId: Meteor.userId()
                }
            });
        } else {
            Events.insert({
                name: newEvent.name,
                type: newEvent.type,
                amount: parseFloat(newEvent.amount),
                date: moment(newEvent.date).format('YYYY-MM-DD'),
                recurringInterval: newEvent.recurringInterval,
                recurringCount: newEvent.recurringCount,
                userId: Meteor.userId()
            });
        }

        $('#add-event-form').find('input, select').not('[type=submit]').val('');
        $('#add-event-form').find('input[type=checkbox]').prop('checked', false);
        $('#add-event-modal').modal('hide');
    },
    'change #recurring': function () {
        if ($('#recurring').is(':checked')) {
            $('#recurring_fields').find('input,select').removeAttr('disabled');
        } else {
            $('#recurring_fields').find('input,select').attr('disabled', 'disabled');
        }
    }
};

Template.eventsTable.events = {
    'click .delete': function () {
        if (confirm('Are you sure you want to delete this?')) {
            Events.remove(this._id);
        }
    },
    'click .edit': function () {
        var f = $('#add-event-form');
        var eventToEdit = Events.find({ _id: this._id}).fetch().shift();

        f.find('[name=_id]').val(eventToEdit._id);
        f.find('[name=name]').val(eventToEdit.name);
        f.find('[name=type]').val(eventToEdit.type);
        f.find('[name=date]').val(moment(eventToEdit.date).format('MM/DD/YYYY'));
        f.find('[name=amount]').val(eventToEdit.amount);

        if (eventToEdit.recurringInterval && eventToEdit.recurringCount) {
            f.find('#recurring').attr('checked', true);
            f.find('#recurring_fields').find('input,select').removeAttr('disabled');
        }

        f.find('[name=recurringCount]').val(eventToEdit.recurringCount);
        f.find('[name=recurringInterval]').val(eventToEdit.recurringInterval);
        $('#add-event-modal').modal('show');
    }
};

Template.snapshot.events = {
    'blur #balance': function () {
        Session.set('balance', parseFloat($('#balance').val() !== '' ? $('#balance').val() : 0));
    }
};
