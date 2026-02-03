from task import Task
from household import Household

class TaskLocation:
    def __init__(self, user : str, locationName : str, household: Household):
        self.user = user
        self.locationName = locationName
        self.tasks = []
        self.household = household

    def addTask(self, task : Task):
        assert(task.location == self)
        self.tasks.append(task)

    
    
